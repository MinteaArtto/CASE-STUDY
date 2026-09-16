import random
from pathlib import Path

import joblib
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
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

MODEL_DIR = Path(__file__).resolve().parent / "model"

CNN_MODEL_PATH = (
    MODEL_DIR / "fresh_rotten_model.pth"
)

DECISION_TREE_PATH = (
    MODEL_DIR / "fresh_rotten_decision_tree.joblib"
)

FEATURE_CACHE_PATH = (
    MODEL_DIR / "fresh_rotten_features.npz"
)

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
# 2. DISPLAY SYSTEM INFORMATION
# ============================================================

print("=" * 70)
print("CNN FEATURE EXTRACTION + DECISION TREE")
print("=" * 70)

print(f"Device: {DEVICE}")

if torch.cuda.is_available():
    print(
        f"GPU: {torch.cuda.get_device_name(0)}"
    )
    print(
        f"CUDA: {torch.version.cuda}"
    )

print()


# ============================================================
# 3. HELPER: FIND IMAGES
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


# ============================================================
# 4. LOAD IMAGE PATHS
# ============================================================

fresh_folder = DATASET_PATH / "Fresh"
rotten_folder = DATASET_PATH / "Rotten"

print("Searching for images...")

fresh_images = get_images(
    fresh_folder
)

rotten_images = get_images(
    rotten_folder
)

print(
    f"Fresh images found: "
    f"{len(fresh_images)}"
)

print(
    f"Rotten images found: "
    f"{len(rotten_images)}"
)

print()


# ============================================================
# 5. BALANCE DATASET
# ============================================================

random.seed(RANDOM_SEED)

random.shuffle(fresh_images)
random.shuffle(rotten_images)

fresh_images = fresh_images[
    :IMAGES_PER_CLASS
]

rotten_images = rotten_images[
    :IMAGES_PER_CLASS
]

print("Images selected:")

print(
    f"Fresh: {len(fresh_images)}"
)

print(
    f"Rotten: {len(rotten_images)}"
)

print(
    f"Total: "
    f"{len(fresh_images) + len(rotten_images)}"
)

print()


# ============================================================
# 6. CREATE LABELS
# ============================================================

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
# 7. TRAIN / VALIDATION / TEST SPLIT
# ============================================================

train_images, temp_images, train_labels, temp_labels = (
    train_test_split(
        all_images,
        all_labels,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=all_labels,
    )
)

val_images, test_images, val_labels, test_labels = (
    train_test_split(
        temp_images,
        temp_labels,
        test_size=0.50,
        random_state=RANDOM_SEED,
        stratify=temp_labels,
    )
)

print("Dataset split:")

print(
    f"Training:   "
    f"{len(train_images)}"
)

print(
    f"Validation: "
    f"{len(val_images)}"
)

print(
    f"Testing:    "
    f"{len(test_images)}"
)

print()


# ============================================================
# 8. IMAGE TRANSFORM
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
        transform=None,
    ):
        self.image_paths = (
            image_paths
        )

        self.labels = labels

        self.transform = transform

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

        if self.transform:
            image = self.transform(
                image
            )

        return image, label


# ============================================================
# 10. DATA LOADERS
# ============================================================

train_dataset = FoodDataset(
    train_images,
    train_labels,
    transform,
)

val_dataset = FoodDataset(
    val_images,
    val_labels,
    transform,
)

test_dataset = FoodDataset(
    test_images,
    test_labels,
    transform,
)

train_loader = DataLoader(
    train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
)

val_loader = DataLoader(
    val_dataset,
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
# 11. LOAD YOUR TRAINED MOBILENETV2
# ============================================================

print("=" * 70)
print("LOADING TRAINED CNN")
print("=" * 70)

model = models.mobilenet_v2(
    weights=None
)

model.classifier[1] = nn.Linear(
    model.last_channel,
    2,
)

model.load_state_dict(
    torch.load(
        CNN_MODEL_PATH,
        map_location=DEVICE,
    )
)

model = model.to(DEVICE)

model.eval()

print(
    f"Loaded CNN from:"
)

print(
    CNN_MODEL_PATH
)

print()


# ============================================================
# 12. CREATE FEATURE EXTRACTOR
# ============================================================

# MobileNetV2 normally performs:
#
# convolutional features
# -> adaptive average pooling
# -> flatten
# -> dropout
# -> final Linear layer
#
# We want the 1280-value vector BEFORE
# the final Fresh/Rotten classifier.

feature_extractor = nn.Sequential(
    model.features,

    nn.AdaptiveAvgPool2d(
        (1, 1)
    ),

    nn.Flatten(),
)

feature_extractor = (
    feature_extractor.to(
        DEVICE
    )
)

feature_extractor.eval()

print(
    "Feature extractor ready."
)

print(
    f"Expected feature size: "
    f"{model.last_channel}"
)

print()


# ============================================================
# 13. FEATURE EXTRACTION FUNCTION
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
            images = images.to(
                DEVICE
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

    features_array = np.concatenate(
        all_features,
        axis=0,
    )

    labels_array = np.concatenate(
        all_labels,
        axis=0,
    )

    return (
        features_array,
        labels_array,
    )


# ============================================================
# 14. EXTRACT CNN FEATURES
# ============================================================

print("=" * 70)
print("EXTRACTING CNN FEATURES")
print("=" * 70)

X_train, y_train = (
    extract_features(
        train_loader,
        "Training features",
    )
)

X_val, y_val = (
    extract_features(
        val_loader,
        "Validation features",
    )
)

X_test, y_test = (
    extract_features(
        test_loader,
        "Testing features",
    )
)

print()

print(
    f"Training features shape: "
    f"{X_train.shape}"
)

print(
    f"Validation features shape: "
    f"{X_val.shape}"
)

print(
    f"Testing features shape: "
    f"{X_test.shape}"
)

print()


# ============================================================
# 15. SAVE FEATURE CACHE
# ============================================================

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

np.savez_compressed(
    FEATURE_CACHE_PATH,

    X_train=X_train,
    y_train=y_train,

    X_val=X_val,
    y_val=y_val,

    X_test=X_test,
    y_test=y_test,
)

print(
    f"Feature cache saved to:"
)

print(
    FEATURE_CACHE_PATH
)

print()


# ============================================================
# 16. TRY DIFFERENT DECISION TREE SETTINGS
# ============================================================

print("=" * 70)
print("DECISION TREE VALIDATION")
print("=" * 70)

candidate_settings = [
    {
        "max_depth": 5,
        "min_samples_split": 10,
        "min_samples_leaf": 5,
    },
    {
        "max_depth": 10,
        "min_samples_split": 10,
        "min_samples_leaf": 5,
    },
    {
        "max_depth": 15,
        "min_samples_split": 10,
        "min_samples_leaf": 5,
    },
    {
        "max_depth": 20,
        "min_samples_split": 10,
        "min_samples_leaf": 5,
    },
    {
        "max_depth": None,
        "min_samples_split": 10,
        "min_samples_leaf": 5,
    },
]

best_tree = None

best_settings = None

best_validation_accuracy = 0.0


for settings in candidate_settings:

    print()

    print(
        "Testing settings:"
    )

    print(
        settings
    )

    tree = (
        DecisionTreeClassifier(
            criterion="gini",

            max_depth=
                settings[
                    "max_depth"
                ],

            min_samples_split=
                settings[
                    "min_samples_split"
                ],

            min_samples_leaf=
                settings[
                    "min_samples_leaf"
                ],

            class_weight=
                "balanced",

            random_state=
                RANDOM_SEED,
        )
    )

    tree.fit(
        X_train,
        y_train,
    )

    val_predictions = (
        tree.predict(
            X_val
        )
    )

    val_accuracy = (
        accuracy_score(
            y_val,
            val_predictions,
        )
    )

    print(
        f"Validation accuracy: "
        f"{val_accuracy:.4f}"
    )

    if (
        val_accuracy
        >
        best_validation_accuracy
    ):
        best_validation_accuracy = (
            val_accuracy
        )

        best_tree = tree

        best_settings = (
            settings
        )


# ============================================================
# 17. SHOW BEST SETTINGS
# ============================================================

print()

print("=" * 70)
print("BEST DECISION TREE")
print("=" * 70)

print(
    f"Best settings: "
    f"{best_settings}"
)

print(
    f"Best validation accuracy: "
    f"{best_validation_accuracy:.4f}"
)

print()


# ============================================================
# 18. TEST FINAL DECISION TREE
# ============================================================

print("=" * 70)
print("TESTING DECISION TREE")
print("=" * 70)

test_predictions = (
    best_tree.predict(
        X_test
    )
)

test_accuracy = (
    accuracy_score(
        y_test,
        test_predictions,
    )
)

print(
    f"Test Accuracy: "
    f"{test_accuracy:.4f}"
)

print()


# ============================================================
# 19. CLASSIFICATION REPORT
# ============================================================

print("=" * 70)
print("CLASSIFICATION REPORT")
print("=" * 70)

print(
    classification_report(
        y_test,
        test_predictions,
        target_names=[
            "Fresh",
            "Rotten",
        ],
    )
)


# ============================================================
# 20. CONFUSION MATRIX
# ============================================================

print("=" * 70)
print("CONFUSION MATRIX")
print("=" * 70)

matrix = confusion_matrix(
    y_test,
    test_predictions,
)

print(
    matrix
)

print()


# ============================================================
# 21. SAVE DECISION TREE MODEL
# ============================================================

joblib.dump(
    {
        "model": best_tree,

        "class_names": [
            "Fresh",
            "Rotten",
        ],

        "feature_size":
            model.last_channel,

        "cnn_model":
            str(
                CNN_MODEL_PATH
            ),

        "best_settings":
            best_settings,

        "validation_accuracy":
            best_validation_accuracy,

        "test_accuracy":
            test_accuracy,
    },
    DECISION_TREE_PATH,
)

print("=" * 70)
print("TRAINING COMPLETE")
print("=" * 70)

print(
    f"Decision Tree saved to:"
)

print(
    DECISION_TREE_PATH
)

print()

print(
    f"Final Test Accuracy: "
    f"{test_accuracy:.4f}"
)