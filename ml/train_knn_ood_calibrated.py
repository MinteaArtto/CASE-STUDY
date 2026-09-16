from pathlib import Path
import random

import joblib
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from tqdm import tqdm


# ============================================================
# SETTINGS
# ============================================================

DATASET_PATH = Path(
    r"C:\Users\Charmaine\Downloads\archive (1)\Dataset"
)

BASE_DIR = Path(__file__).resolve().parent

MODEL_DIR = BASE_DIR / "model"

CNN_MODEL_PATH = (
    MODEL_DIR
    / "fresh_rotten_model.pth"
)

OOD_MODEL_PATH = (
    MODEL_DIR
    / "fresh_rotten_knn_ood_calibrated.joblib"
)

MAX_IMAGES_PER_CLASS = 10000

REFERENCE_RATIO = 0.80

BATCH_SIZE = 64

K_NEIGHBORS = 10

RANDOM_SEED = 42

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
}


# ============================================================
# RANDOM SEEDS
# ============================================================

random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)


# ============================================================
# IMAGE TRANSFORM
# ============================================================

transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[
            0.485,
            0.456,
            0.406,
        ],
        std=[
            0.229,
            0.224,
            0.225,
        ],
    ),
])


# ============================================================
# FIND IMAGES
# ============================================================

def get_images(folder):

    images = []

    for file in folder.rglob("*"):

        if (
            file.is_file()
            and file.suffix.lower() in IMAGE_EXTENSIONS
        ):

            images.append(file)

    return images


# ============================================================
# DATASET CLASS
# ============================================================

class ImageDataset(Dataset):

    def __init__(
        self,
        image_paths,
        labels,
        transform,
    ):

        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform


    def __len__(self):

        return len(self.image_paths)


    def __getitem__(
        self,
        index,
    ):

        image_path = self.image_paths[index]

        label = self.labels[index]

        image = Image.open(
            image_path
        ).convert("RGB")

        image = self.transform(
            image
        )

        return image, label


# ============================================================
# LOAD DATA
# ============================================================

fresh_images = get_images(
    DATASET_PATH / "Fresh"
)

rotten_images = get_images(
    DATASET_PATH / "Rotten"
)

print(
    f"Fresh images found: {len(fresh_images)}"
)

print(
    f"Rotten images found: {len(rotten_images)}"
)

random.shuffle(fresh_images)
random.shuffle(rotten_images)

fresh_images = fresh_images[
    :MAX_IMAGES_PER_CLASS
]

rotten_images = rotten_images[
    :MAX_IMAGES_PER_CLASS
]


all_images = (
    fresh_images
    + rotten_images
)

all_labels = (
    [0] * len(fresh_images)
    +
    [1] * len(rotten_images)
)


# ============================================================
# REFERENCE / CALIBRATION SPLIT
#
# Calibration images are NEVER placed in KNN reference.
# ============================================================

(
    reference_images,
    calibration_images,
    reference_labels,
    calibration_labels,
) = train_test_split(
    all_images,
    all_labels,
    test_size=1 - REFERENCE_RATIO,
    random_state=RANDOM_SEED,
    stratify=all_labels,
)


print()
print("=" * 70)
print("DATA SPLIT")
print("=" * 70)

print(
    f"Reference images: "
    f"{len(reference_images)}"
)

print(
    f"Calibration images: "
    f"{len(calibration_images)}"
)

print()

print(
    "Calibration images are NOT used "
    "to build the KNN reference."
)


# ============================================================
# LOAD CNN
# ============================================================

print()
print("Loading CNN...")

cnn = models.mobilenet_v2(
    weights=None
)

cnn.classifier[1] = nn.Linear(
    cnn.last_channel,
    2,
)

cnn.load_state_dict(
    torch.load(
        CNN_MODEL_PATH,
        map_location=DEVICE,
    )
)

cnn = cnn.to(
    DEVICE
)

cnn.eval()


# ============================================================
# FEATURE EXTRACTOR
# ============================================================

feature_extractor = nn.Sequential(
    cnn.features,

    nn.AdaptiveAvgPool2d(
        (1, 1)
    ),

    nn.Flatten(),
)

feature_extractor = feature_extractor.to(
    DEVICE
)

feature_extractor.eval()


# ============================================================
# FEATURE EXTRACTION FUNCTION
# ============================================================

def extract_features(
    image_paths,
    labels,
    description,
):

    dataset = ImageDataset(
        image_paths,
        labels,
        transform,
    )

    loader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )

    features = []
    collected_labels = []

    with torch.no_grad():

        for images, batch_labels in tqdm(
            loader,
            desc=description,
        ):

            images = images.to(
                DEVICE
            )

            batch_features = (
                feature_extractor(
                    images
                )
            )

            features.append(
                batch_features
                .cpu()
                .numpy()
            )

            collected_labels.append(
                batch_labels.numpy()
            )


    return (
        np.concatenate(
            features,
            axis=0,
        ),

        np.concatenate(
            collected_labels,
            axis=0,
        ),
    )


# ============================================================
# EXTRACT REFERENCE FEATURES
# ============================================================

print()
print("Extracting reference features...")

X_reference, y_reference = (
    extract_features(
        reference_images,
        reference_labels,
        "Reference features",
    )
)


# ============================================================
# EXTRACT CALIBRATION FEATURES
# ============================================================

print()
print("Extracting calibration features...")

X_calibration, y_calibration = (
    extract_features(
        calibration_images,
        calibration_labels,
        "Calibration features",
    )
)


print()
print(
    f"Reference feature matrix: "
    f"{X_reference.shape}"
)

print(
    f"Calibration feature matrix: "
    f"{X_calibration.shape}"
)


# ============================================================
# STANDARDIZE
#
# Fit scaler ONLY on reference set.
# ============================================================

print()
print("Standardizing features...")

scaler = StandardScaler()

X_reference_scaled = (
    scaler.fit_transform(
        X_reference
    )
)

X_calibration_scaled = (
    scaler.transform(
        X_calibration
    )
)


# ============================================================
# BUILD KNN REFERENCE
# ============================================================

print()
print(
    f"Building KNN model "
    f"with k={K_NEIGHBORS}..."
)

knn = NearestNeighbors(
    n_neighbors=K_NEIGHBORS,
    metric="euclidean",
    algorithm="auto",
    n_jobs=-1,
)

knn.fit(
    X_reference_scaled
)


# ============================================================
# CALIBRATION DISTANCES
#
# Because calibration images are NOT reference images,
# we do not remove a self-neighbor.
# ============================================================

print()
print(
    "Calculating calibration distances..."
)

calibration_distances, _ = (
    knn.kneighbors(
        X_calibration_scaled,
        n_neighbors=K_NEIGHBORS,
    )
)

mean_calibration_distances = (
    np.mean(
        calibration_distances,
        axis=1,
    )
)


# ============================================================
# THRESHOLDS
# ============================================================

mean_distance = float(
    np.mean(
        mean_calibration_distances
    )
)

std_distance = float(
    np.std(
        mean_calibration_distances
    )
)

p90 = float(
    np.percentile(
        mean_calibration_distances,
        90,
    )
)

p95 = float(
    np.percentile(
        mean_calibration_distances,
        95,
    )
)

p97 = float(
    np.percentile(
        mean_calibration_distances,
        97,
    )
)

p99 = float(
    np.percentile(
        mean_calibration_distances,
        99,
    )
)


# ============================================================
# ACCEPTANCE RATES
# ============================================================

acceptance_95 = float(
    np.mean(
        mean_calibration_distances
        <= p95
    )
)

acceptance_97 = float(
    np.mean(
        mean_calibration_distances
        <= p97
    )
)

acceptance_99 = float(
    np.mean(
        mean_calibration_distances
        <= p99
    )
)


# ============================================================
# FRESH VS ROTTEN DISTANCE ANALYSIS
# ============================================================

fresh_distances = (
    mean_calibration_distances[
        y_calibration == 0
    ]
)

rotten_distances = (
    mean_calibration_distances[
        y_calibration == 1
    ]
)


print()
print("=" * 70)
print("CALIBRATED KNN OOD STATISTICS")
print("=" * 70)

print(
    f"Mean distance: "
    f"{mean_distance:.4f}"
)

print(
    f"Std distance: "
    f"{std_distance:.4f}"
)

print()

print(
    f"90th percentile: "
    f"{p90:.4f}"
)

print(
    f"95th percentile: "
    f"{p95:.4f}"
)

print(
    f"97th percentile: "
    f"{p97:.4f}"
)

print(
    f"99th percentile: "
    f"{p99:.4f}"
)

print()

print(
    "Known-produce acceptance:"
)

print(
    f"At p95: "
    f"{acceptance_95 * 100:.2f}%"
)

print(
    f"At p97: "
    f"{acceptance_97 * 100:.2f}%"
)

print(
    f"At p99: "
    f"{acceptance_99 * 100:.2f}%"
)

print()

print(
    f"Fresh calibration mean: "
    f"{np.mean(fresh_distances):.4f}"
)

print(
    f"Rotten calibration mean: "
    f"{np.mean(rotten_distances):.4f}"
)

print(
    f"Fresh calibration p99: "
    f"{np.percentile(fresh_distances, 99):.4f}"
)

print(
    f"Rotten calibration p99: "
    f"{np.percentile(rotten_distances, 99):.4f}"
)


# ============================================================
# SAVE MODEL
# ============================================================

joblib.dump(
    {
        "scaler":
            scaler,

        "knn":
            knn,

        "k_neighbors":
            K_NEIGHBORS,

        "mean_distance":
            mean_distance,

        "std_distance":
            std_distance,

        "p90":
            p90,

        "p95":
            p95,

        "p97":
            p97,

        "p99":
            p99,

        "reference_count":
            len(reference_images),

        "calibration_count":
            len(calibration_images),

        "feature_size":
            X_reference.shape[1],

        "fresh_mean_distance":
            float(
                np.mean(
                    fresh_distances
                )
            ),

        "rotten_mean_distance":
            float(
                np.mean(
                    rotten_distances
                )
            ),

        "fresh_p99":
            float(
                np.percentile(
                    fresh_distances,
                    99,
                )
            ),

        "rotten_p99":
            float(
                np.percentile(
                    rotten_distances,
                    99,
                )
            ),
    },
    OOD_MODEL_PATH,
)


print()
print(
    "Calibrated KNN OOD detector saved to:"
)

print(
    OOD_MODEL_PATH
)

print()
print("=" * 70)
print("CALIBRATION COMPLETE")
print("=" * 70)