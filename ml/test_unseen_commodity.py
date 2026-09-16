import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.tree import DecisionTreeClassifier
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from tqdm import tqdm


# ============================================================
# 1. SETTINGS
# ============================================================

DATASET_PATH = Path(
    r"C:\Users\Charmaine\Downloads\archive (1)\Dataset"
)

CNN_MODEL_PATH = (
    Path(__file__).resolve().parent
    / "model"
    / "fresh_rotten_model.pth"
)

# Change this later to test other commodities.
HELD_OUT_COMMODITY = "Banana"

IMAGES_PER_CLASS = 20000

BATCH_SIZE = 64

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
# 2. SYSTEM INFORMATION
# ============================================================

print("=" * 70)
print("HELD-OUT COMMODITY GENERALIZATION TEST")
print("=" * 70)

print(f"Device: {DEVICE}")
print(f"Held-out commodity: {HELD_OUT_COMMODITY}")

if torch.cuda.is_available():
    print(
        f"GPU: {torch.cuda.get_device_name(0)}"
    )

print()


# ============================================================
# 3. HELPER FUNCTIONS
# ============================================================

def get_images(folder):

    images = []

    for file in folder.rglob("*"):

        if (
            file.is_file()
            and file.suffix.lower()
            in IMAGE_EXTENSIONS
        ):
            images.append(file)

    return images


def is_held_out(image_path):

    folder_name = (
        image_path.parent.name.lower()
    )

    commodity = (
        HELD_OUT_COMMODITY.lower()
    )

    return commodity in folder_name


# ============================================================
# 4. LOAD ALL IMAGES
# ============================================================

fresh_folder = (
    DATASET_PATH / "Fresh"
)

rotten_folder = (
    DATASET_PATH / "Rotten"
)

print("Searching for images...")

fresh_images = get_images(
    fresh_folder
)

rotten_images = get_images(
    rotten_folder
)

print(
    f"Fresh images found: {len(fresh_images)}"
)

print(
    f"Rotten images found: {len(rotten_images)}"
)

print()


# ============================================================
# 5. SEPARATE HELD-OUT COMMODITY
# ============================================================

fresh_held_out = [
    image
    for image in fresh_images
    if is_held_out(image)
]

rotten_held_out = [
    image
    for image in rotten_images
    if is_held_out(image)
]

fresh_training_pool = [
    image
    for image in fresh_images
    if not is_held_out(image)
]

rotten_training_pool = [
    image
    for image in rotten_images
    if not is_held_out(image)
]


print(
    f"Held-out Fresh "
    f"{HELD_OUT_COMMODITY}: "
    f"{len(fresh_held_out)}"
)

print(
    f"Held-out Rotten "
    f"{HELD_OUT_COMMODITY}: "
    f"{len(rotten_held_out)}"
)

print()

print(
    f"Remaining Fresh training pool: "
    f"{len(fresh_training_pool)}"
)

print(
    f"Remaining Rotten training pool: "
    f"{len(rotten_training_pool)}"
)

print()


if (
    len(fresh_held_out) == 0
    or len(rotten_held_out) == 0
):

    print(
        "ERROR: Could not find both "
        "Fresh and Rotten folders "
        f"for {HELD_OUT_COMMODITY}."
    )

    raise SystemExit(1)


# ============================================================
# 6. BALANCE TRAINING DATA
# ============================================================

random.seed(
    RANDOM_SEED
)

random.shuffle(
    fresh_training_pool
)

random.shuffle(
    rotten_training_pool
)

training_count = min(
    IMAGES_PER_CLASS,
    len(fresh_training_pool),
    len(rotten_training_pool),
)

fresh_training_pool = (
    fresh_training_pool[
        :training_count
    ]
)

rotten_training_pool = (
    rotten_training_pool[
        :training_count
    ]
)


train_images = (
    fresh_training_pool
    + rotten_training_pool
)

train_labels = (
    [0] * len(fresh_training_pool)
    +
    [1] * len(rotten_training_pool)
)


# ============================================================
# 7. BUILD HELD-OUT TEST SET
# ============================================================

held_out_count = min(
    len(fresh_held_out),
    len(rotten_held_out),
)

random.shuffle(
    fresh_held_out
)

random.shuffle(
    rotten_held_out
)

fresh_held_out = (
    fresh_held_out[
        :held_out_count
    ]
)

rotten_held_out = (
    rotten_held_out[
        :held_out_count
    ]
)


test_images = (
    fresh_held_out
    + rotten_held_out
)

test_labels = (
    [0] * len(fresh_held_out)
    +
    [1] * len(rotten_held_out)
)


print("=" * 70)
print("DATASET SUMMARY")
print("=" * 70)

print(
    f"Training Fresh: "
    f"{len(fresh_training_pool)}"
)

print(
    f"Training Rotten: "
    f"{len(rotten_training_pool)}"
)

print(
    f"Total training: "
    f"{len(train_images)}"
)

print()

print(
    f"Held-out Fresh: "
    f"{len(fresh_held_out)}"
)

print(
    f"Held-out Rotten: "
    f"{len(rotten_held_out)}"
)

print(
    f"Total held-out test: "
    f"{len(test_images)}"
)

print()


# ============================================================
# 8. TRANSFORM
# ============================================================

transform = transforms.Compose([
    transforms.Resize(
        (224, 224)
    ),

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
# 9. DATASET CLASS
# ============================================================

class FoodDataset(Dataset):

    def __init__(
        self,
        image_paths,
        labels,
    ):
        self.image_paths = (
            image_paths
        )

        self.labels = (
            labels
        )

    def __len__(self):

        return len(
            self.image_paths
        )

    def __getitem__(
        self,
        index,
    ):

        image_path = (
            self.image_paths[
                index
            ]
        )

        label = (
            self.labels[
                index
            ]
        )

        image = Image.open(
            image_path
        ).convert("RGB")

        image = transform(
            image
        )

        return (
            image,
            label,
        )


# ============================================================
# 10. DATA LOADERS
# ============================================================

train_dataset = FoodDataset(
    train_images,
    train_labels,
)

test_dataset = FoodDataset(
    test_images,
    test_labels,
)

train_loader = DataLoader(
    train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
)

test_loader = DataLoader(
    test_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
)


# ============================================================
# 11. LOAD TRAINED CNN
# ============================================================

print("=" * 70)
print("LOADING CNN FEATURE EXTRACTOR")
print("=" * 70)

cnn_model = (
    models.mobilenet_v2(
        weights=None
    )
)

cnn_model.classifier[1] = (
    nn.Linear(
        cnn_model.last_channel,
        2,
    )
)

cnn_model.load_state_dict(
    torch.load(
        CNN_MODEL_PATH,
        map_location=DEVICE,
    )
)

cnn_model = cnn_model.to(
    DEVICE
)

cnn_model.eval()


# ============================================================
# 12. FEATURE EXTRACTOR
# ============================================================

feature_extractor = (
    nn.Sequential(
        cnn_model.features,

        nn.AdaptiveAvgPool2d(
            (1, 1)
        ),

        nn.Flatten(),
    )
)

feature_extractor = (
    feature_extractor.to(
        DEVICE
    )
)

feature_extractor.eval()

print(
    "CNN feature extractor ready."
)

print()


# ============================================================
# 13. FEATURE EXTRACTION
# ============================================================

def extract_features(
    loader,
    description,
):

    all_features = []
    all_labels = []

    with torch.no_grad():

        for images, labels in tqdm(
            loader,
            desc=description,
        ):

            images = (
                images.to(
                    DEVICE
                )
            )

            features = (
                feature_extractor(
                    images
                )
            )

            all_features.append(
                features
                .cpu()
                .numpy()
            )

            all_labels.append(
                labels.numpy()
            )

    return (
        np.concatenate(
            all_features,
            axis=0,
        ),

        np.concatenate(
            all_labels,
            axis=0,
        ),
    )


# ============================================================
# 14. EXTRACT TRAINING FEATURES
# ============================================================

print("=" * 70)
print("EXTRACTING FEATURES")
print("=" * 70)

X_train, y_train = (
    extract_features(
        train_loader,
        "Training features",
    )
)

X_test, y_test = (
    extract_features(
        test_loader,
        "Held-out features",
    )
)

print()

print(
    f"Training feature shape: "
    f"{X_train.shape}"
)

print(
    f"Held-out feature shape: "
    f"{X_test.shape}"
)

print()


# ============================================================
# 15. TRAIN DECISION TREE
# ============================================================

print("=" * 70)
print("TRAINING DECISION TREE")
print("=" * 70)

tree = DecisionTreeClassifier(
    criterion="gini",
    max_depth=10,
    min_samples_split=10,
    min_samples_leaf=5,
    class_weight="balanced",
    random_state=RANDOM_SEED,
)

tree.fit(
    X_train,
    y_train,
)

print(
    "Decision Tree trained."
)

print()


# ============================================================
# 16. TEST ON UNSEEN COMMODITY
# ============================================================

predictions = tree.predict(
    X_test
)

accuracy = accuracy_score(
    y_test,
    predictions,
)


print("=" * 70)
print("HELD-OUT COMMODITY RESULTS")
print("=" * 70)

print(
    f"Commodity: "
    f"{HELD_OUT_COMMODITY}"
)

print(
    f"Accuracy: "
    f"{accuracy:.4f}"
)

print()


print("=" * 70)
print("CLASSIFICATION REPORT")
print("=" * 70)

print(
    classification_report(
        y_test,
        predictions,
        target_names=[
            "Fresh",
            "Rotten",
        ],
    )
)


print("=" * 70)
print("CONFUSION MATRIX")
print("=" * 70)

matrix = confusion_matrix(
    y_test,
    predictions,
)

print(
    matrix
)

print()


print("=" * 70)
print("TEST COMPLETE")
print("=" * 70)