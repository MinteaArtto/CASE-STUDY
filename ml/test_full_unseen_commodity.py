import json
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

BASE_DIR = Path(__file__).resolve().parent

MODEL_DIR = BASE_DIR / "model"

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

HELD_OUT_COMMODITY = "Tomato"

MAX_IMAGES_PER_CLASS = 20000

BATCH_SIZE = 32

FEATURE_BATCH_SIZE = 64

NUM_EPOCHS = 1

LEARNING_RATE = 0.0001

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
# 2. OUTPUT FILES
# ============================================================

safe_commodity = (
    HELD_OUT_COMMODITY
    .lower()
    .replace(" ", "_")
)

CNN_MODEL_PATH = (
    MODEL_DIR
    / f"fresh_rotten_cnn_no_{safe_commodity}.pth"
)

TREE_MODEL_PATH = (
    MODEL_DIR
    / f"fresh_rotten_tree_no_{safe_commodity}.joblib"
)

RESULTS_PATH = (
    MODEL_DIR
    / f"unseen_{safe_commodity}_comparison.json"
)


# ============================================================
# 3. RANDOM SEEDS
# ============================================================

random.seed(
    RANDOM_SEED
)

np.random.seed(
    RANDOM_SEED
)

torch.manual_seed(
    RANDOM_SEED
)

if torch.cuda.is_available():
    torch.cuda.manual_seed_all(
        RANDOM_SEED
    )


# ============================================================
# 4. SYSTEM INFORMATION
# ============================================================

print("=" * 75)
print("FULL UNSEEN-COMMODITY COMPARISON")
print("=" * 75)

print(
    f"Held-out commodity: "
    f"{HELD_OUT_COMMODITY}"
)

print(
    f"Device: {DEVICE}"
)

if torch.cuda.is_available():

    print(
        f"GPU: "
        f"{torch.cuda.get_device_name(0)}"
    )

    print(
        f"CUDA: "
        f"{torch.version.cuda}"
    )

print()


# ============================================================
# 5. FIND IMAGES
# ============================================================

def get_images(folder):

    images = []

    for file in folder.rglob("*"):

        if (
            file.is_file()
            and file.suffix.lower()
            in IMAGE_EXTENSIONS
        ):

            images.append(
                file
            )

    return images


def is_held_out(
    image_path
):

    folder_name = (
        image_path
        .parent
        .name
        .lower()
    )

    target = (
        HELD_OUT_COMMODITY
        .lower()
    )

    return (
        target
        in folder_name
    )


# ============================================================
# 6. LOAD ALL DATASET IMAGES
# ============================================================

fresh_folder = (
    DATASET_PATH
    / "Fresh"
)

rotten_folder = (
    DATASET_PATH
    / "Rotten"
)

print(
    "Searching for dataset images..."
)

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
# 7. REMOVE HELD-OUT COMMODITY COMPLETELY
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
    f"Non-{HELD_OUT_COMMODITY} "
    f"Fresh pool: "
    f"{len(fresh_training_pool)}"
)

print(
    f"Non-{HELD_OUT_COMMODITY} "
    f"Rotten pool: "
    f"{len(rotten_training_pool)}"
)

print()


if (
    len(fresh_held_out) == 0
    or len(rotten_held_out) == 0
):

    print(
        "ERROR: Could not find both "
        "Fresh and Rotten images for "
        f"{HELD_OUT_COMMODITY}."
    )

    raise SystemExit(1)


# ============================================================
# 8. BALANCE NON-HELD-OUT TRAINING DATA
# ============================================================

random.shuffle(
    fresh_training_pool
)

random.shuffle(
    rotten_training_pool
)

training_count = min(
    MAX_IMAGES_PER_CLASS,
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

all_training_images = (
    fresh_training_pool
    + rotten_training_pool
)

all_training_labels = (
    [0] * len(
        fresh_training_pool
    )
    +
    [1] * len(
        rotten_training_pool
    )
)


# ============================================================
# 9. TRAIN / VALIDATION SPLIT
#
# Held-out commodity is NOT used here.
# ============================================================

(
    train_images,
    val_images,
    train_labels,
    val_labels,
) = train_test_split(
    all_training_images,
    all_training_labels,
    test_size=0.15,
    random_state=RANDOM_SEED,
    stratify=all_training_labels,
)


# ============================================================
# 10. BUILD BALANCED HELD-OUT TEST SET
# ============================================================

random.shuffle(
    fresh_held_out
)

random.shuffle(
    rotten_held_out
)

held_out_count = min(
    len(fresh_held_out),
    len(rotten_held_out),
)

fresh_test_images = (
    fresh_held_out[
        :held_out_count
    ]
)

rotten_test_images = (
    rotten_held_out[
        :held_out_count
    ]
)

test_images = (
    fresh_test_images
    + rotten_test_images
)

test_labels = (
    [0] * len(
        fresh_test_images
    )
    +
    [1] * len(
        rotten_test_images
    )
)


# ============================================================
# 11. DATASET SUMMARY
# ============================================================

print("=" * 75)
print("DATASET SUMMARY")
print("=" * 75)

print(
    f"CNN/Tree training images: "
    f"{len(train_images)}"
)

print(
    f"Validation images: "
    f"{len(val_images)}"
)

print(
    f"Held-out test images: "
    f"{len(test_images)}"
)

print()

print(
    f"Held-out Fresh: "
    f"{len(fresh_test_images)}"
)

print(
    f"Held-out Rotten: "
    f"{len(rotten_test_images)}"
)

print()

print(
    f"IMPORTANT:"
)

print(
    f"No {HELD_OUT_COMMODITY} "
    f"images are present in CNN "
    f"or Decision Tree training."
)

print()


# ============================================================
# 12. IMAGE TRANSFORMS
# ============================================================

train_transform = (
    transforms.Compose([
        transforms.Resize(
            (224, 224)
        ),

        transforms.RandomHorizontalFlip(),

        transforms.RandomRotation(
            10
        ),

        transforms.ColorJitter(
            brightness=0.2,
            contrast=0.2,
            saturation=0.2,
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
)


test_transform = (
    transforms.Compose([
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
)


# ============================================================
# 13. DATASET CLASS
# ============================================================

class FoodDataset(
    Dataset
):

    def __init__(
        self,
        image_paths,
        labels,
        transform,
    ):

        self.image_paths = (
            image_paths
        )

        self.labels = (
            labels
        )

        self.transform = (
            transform
        )

    def __len__(
        self
    ):

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
        ).convert(
            "RGB"
        )

        image = (
            self.transform(
                image
            )
        )

        return (
            image,
            label,
        )


# ============================================================
# 14. CNN DATASETS
# ============================================================

cnn_train_dataset = FoodDataset(
    train_images,
    train_labels,
    train_transform,
)

cnn_val_dataset = FoodDataset(
    val_images,
    val_labels,
    test_transform,
)

cnn_test_dataset = FoodDataset(
    test_images,
    test_labels,
    test_transform,
)


# ============================================================
# 15. CNN DATA LOADERS
# ============================================================

cnn_train_loader = DataLoader(
    cnn_train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0,
)

cnn_val_loader = DataLoader(
    cnn_val_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
)

cnn_test_loader = DataLoader(
    cnn_test_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
)


# ============================================================
# 16. CREATE NEW CNN
#
# This starts from ImageNet weights.
# It does NOT use fresh_rotten_model.pth.
# ============================================================

print("=" * 75)
print("TRAINING NEW CNN WITHOUT HELD-OUT COMMODITY")
print("=" * 75)

weights = (
    models
    .MobileNet_V2_Weights
    .DEFAULT
)

cnn_model = (
    models.mobilenet_v2(
        weights=weights
    )
)

cnn_model.classifier[1] = (
    nn.Linear(
        cnn_model.last_channel,
        2,
    )
)

cnn_model = (
    cnn_model.to(
        DEVICE
    )
)

criterion = (
    nn.CrossEntropyLoss()
)

optimizer = (
    torch.optim.Adam(
        cnn_model.parameters(),
        lr=LEARNING_RATE,
    )
)


# ============================================================
# 17. TRAIN CNN
# ============================================================

best_validation_accuracy = (
    0.0
)


for epoch in range(
    NUM_EPOCHS
):

    print()

    print(
        f"Epoch "
        f"{epoch + 1}/"
        f"{NUM_EPOCHS}"
    )

    # --------------------------------------------------------
    # TRAIN
    # --------------------------------------------------------

    cnn_model.train()

    training_correct = 0
    training_total = 0

    progress_bar = tqdm(
        cnn_train_loader,
        desc="CNN Training",
    )


    for (
        images,
        labels,
    ) in progress_bar:

        images = images.to(
            DEVICE
        )

        labels = labels.to(
            DEVICE
        )

        optimizer.zero_grad()

        outputs = (
            cnn_model(
                images
            )
        )

        loss = criterion(
            outputs,
            labels,
        )

        loss.backward()

        optimizer.step()

        _, predictions = (
            torch.max(
                outputs,
                1,
            )
        )

        training_total += (
            labels.size(0)
        )

        training_correct += (
            (
                predictions
                == labels
            )
            .sum()
            .item()
        )

        progress_bar.set_postfix(
            loss=f"{loss.item():.4f}"
        )


    training_accuracy = (
        training_correct
        /
        training_total
    )


    # --------------------------------------------------------
    # VALIDATION
    # --------------------------------------------------------

    cnn_model.eval()

    validation_correct = 0
    validation_total = 0


    with torch.no_grad():

        for (
            images,
            labels,
        ) in cnn_val_loader:

            images = images.to(
                DEVICE
            )

            labels = labels.to(
                DEVICE
            )

            outputs = (
                cnn_model(
                    images
                )
            )

            _, predictions = (
                torch.max(
                    outputs,
                    1,
                )
            )

            validation_total += (
                labels.size(0)
            )

            validation_correct += (
                (
                    predictions
                    == labels
                )
                .sum()
                .item()
            )


    validation_accuracy = (
        validation_correct
        /
        validation_total
    )


    print(
        f"Training Accuracy: "
        f"{training_accuracy:.4f}"
    )

    print(
        f"Validation Accuracy: "
        f"{validation_accuracy:.4f}"
    )


    if (
        validation_accuracy
        >
        best_validation_accuracy
    ):

        best_validation_accuracy = (
            validation_accuracy
        )

        torch.save(
            cnn_model.state_dict(),
            CNN_MODEL_PATH,
        )

        print(
            "Best CNN saved."
        )


# ============================================================
# 18. LOAD BEST CNN
# ============================================================

cnn_model.load_state_dict(
    torch.load(
        CNN_MODEL_PATH,
        map_location=DEVICE,
    )
)

cnn_model.eval()


# ============================================================
# 19. TEST CNN DIRECTLY ON UNSEEN COMMODITY
# ============================================================

print()

print("=" * 75)
print("CNN-ONLY HELD-OUT TEST")
print("=" * 75)

cnn_predictions = []

cnn_true_labels = []


with torch.no_grad():

    for (
        images,
        labels,
    ) in tqdm(
        cnn_test_loader,
        desc="CNN held-out test",
    ):

        images = images.to(
            DEVICE
        )

        outputs = (
            cnn_model(
                images
            )
        )

        _, predictions = (
            torch.max(
                outputs,
                1,
            )
        )

        cnn_predictions.extend(
            predictions
            .cpu()
            .numpy()
        )

        cnn_true_labels.extend(
            labels.numpy()
        )


cnn_accuracy = (
    accuracy_score(
        cnn_true_labels,
        cnn_predictions,
    )
)

cnn_matrix = (
    confusion_matrix(
        cnn_true_labels,
        cnn_predictions,
    )
)


print(
    f"CNN Accuracy: "
    f"{cnn_accuracy:.4f}"
)

print()

print(
    classification_report(
        cnn_true_labels,
        cnn_predictions,
        target_names=[
            "Fresh",
            "Rotten",
        ],
        zero_division=0,
    )
)

print(
    "CNN Confusion Matrix:"
)

print(
    cnn_matrix
)

print()


# ============================================================
# 20. BUILD DETERMINISTIC FEATURE DATASETS
#
# No random augmentation for feature extraction.
# ============================================================

feature_train_dataset = (
    FoodDataset(
        train_images,
        train_labels,
        test_transform,
    )
)

feature_val_dataset = (
    FoodDataset(
        val_images,
        val_labels,
        test_transform,
    )
)

feature_test_dataset = (
    FoodDataset(
        test_images,
        test_labels,
        test_transform,
    )
)


feature_train_loader = (
    DataLoader(
        feature_train_dataset,
        batch_size=FEATURE_BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )
)

feature_val_loader = (
    DataLoader(
        feature_val_dataset,
        batch_size=FEATURE_BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )
)

feature_test_loader = (
    DataLoader(
        feature_test_dataset,
        batch_size=FEATURE_BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )
)


# ============================================================
# 21. CREATE CNN FEATURE EXTRACTOR
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


# ============================================================
# 22. FEATURE EXTRACTION FUNCTION
# ============================================================

def extract_features(
    loader,
    description,
):

    all_features = []

    all_labels = []


    with torch.no_grad():

        for (
            images,
            labels,
        ) in tqdm(
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
# 23. EXTRACT FEATURES
# ============================================================

print("=" * 75)
print("EXTRACTING CNN FEATURES FOR DECISION TREE")
print("=" * 75)

X_train, y_train = (
    extract_features(
        feature_train_loader,
        "Tree training features",
    )
)

X_val, y_val = (
    extract_features(
        feature_val_loader,
        "Tree validation features",
    )
)

X_test, y_test = (
    extract_features(
        feature_test_loader,
        "Tree held-out features",
    )
)


print()

print(
    f"Train features: "
    f"{X_train.shape}"
)

print(
    f"Validation features: "
    f"{X_val.shape}"
)

print(
    f"Held-out features: "
    f"{X_test.shape}"
)

print()


# ============================================================
# 24. DECISION TREE SETTINGS
# ============================================================

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


# ============================================================
# 25. SELECT BEST DECISION TREE USING VALIDATION ONLY
# ============================================================

print("=" * 75)
print("DECISION TREE VALIDATION")
print("=" * 75)

best_tree = None

best_settings = None

best_tree_validation_accuracy = (
    0.0
)


for settings in candidate_settings:

    print()

    print(
        f"Testing: "
        f"{settings}"
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


    predictions = (
        tree.predict(
            X_val
        )
    )


    validation_accuracy = (
        accuracy_score(
            y_val,
            predictions,
        )
    )


    print(
        f"Validation Accuracy: "
        f"{validation_accuracy:.4f}"
    )


    if (
        validation_accuracy
        >
        best_tree_validation_accuracy
    ):

        best_tree_validation_accuracy = (
            validation_accuracy
        )

        best_tree = tree

        best_settings = (
            settings
        )


# ============================================================
# 26. TEST DECISION TREE ON SAME HELD-OUT IMAGES
# ============================================================

print()

print("=" * 75)
print("CNN FEATURES + DECISION TREE HELD-OUT TEST")
print("=" * 75)

tree_predictions = (
    best_tree.predict(
        X_test
    )
)

tree_accuracy = (
    accuracy_score(
        y_test,
        tree_predictions,
    )
)

tree_matrix = (
    confusion_matrix(
        y_test,
        tree_predictions,
    )
)


print(
    f"Best Tree Settings: "
    f"{best_settings}"
)

print(
    f"Tree Validation Accuracy: "
    f"{best_tree_validation_accuracy:.4f}"
)

print(
    f"Tree Held-out Accuracy: "
    f"{tree_accuracy:.4f}"
)

print()

print(
    classification_report(
        y_test,
        tree_predictions,
        target_names=[
            "Fresh",
            "Rotten",
        ],
        zero_division=0,
    )
)

print(
    "Decision Tree Confusion Matrix:"
)

print(
    tree_matrix
)

print()


# ============================================================
# 27. SAVE DECISION TREE
# ============================================================

joblib.dump(
    {
        "model":
            best_tree,

        "class_names": [
            "Fresh",
            "Rotten",
        ],

        "feature_size":
            cnn_model.last_channel,

        "held_out_commodity":
            HELD_OUT_COMMODITY,

        "cnn_model_path":
            str(
                CNN_MODEL_PATH
            ),

        "best_settings":
            best_settings,

        "validation_accuracy":
            best_tree_validation_accuracy,

        "held_out_accuracy":
            tree_accuracy,
    },
    TREE_MODEL_PATH,
)


# ============================================================
# 28. FINAL COMPARISON
# ============================================================

difference = (
    tree_accuracy
    - cnn_accuracy
)

print("=" * 75)
print("FINAL COMPARISON")
print("=" * 75)

print(
    f"Held-out commodity: "
    f"{HELD_OUT_COMMODITY}"
)

print()

print(
    f"CNN-only Accuracy:"
)

print(
    f"{cnn_accuracy:.4f} "
    f"({cnn_accuracy * 100:.2f}%)"
)

print()

print(
    f"CNN Features + Decision Tree Accuracy:"
)

print(
    f"{tree_accuracy:.4f} "
    f"({tree_accuracy * 100:.2f}%)"
)

print()


if tree_accuracy > cnn_accuracy:

    print(
        "WINNER: "
        "CNN Features + Decision Tree"
    )

elif cnn_accuracy > tree_accuracy:

    print(
        "WINNER: CNN-only classifier"
    )

else:

    print(
        "RESULT: Tie"
    )


print()

print(
    f"Accuracy difference: "
    f"{difference * 100:+.2f} "
    f"percentage points"
)

print()


# ============================================================
# 29. SAVE COMPARISON RESULTS
# ============================================================

results = {
    "held_out_commodity":
        HELD_OUT_COMMODITY,

    "training_images":
        len(train_images),

    "validation_images":
        len(val_images),

    "held_out_test_images":
        len(test_images),

    "cnn": {
        "validation_accuracy":
            best_validation_accuracy,

        "held_out_accuracy":
            cnn_accuracy,

        "confusion_matrix":
            cnn_matrix.tolist(),
    },

    "cnn_plus_decision_tree": {
        "best_settings":
            best_settings,

        "validation_accuracy":
            best_tree_validation_accuracy,

        "held_out_accuracy":
            tree_accuracy,

        "confusion_matrix":
            tree_matrix.tolist(),
    },

    "accuracy_difference":
        difference,
}


with open(
    RESULTS_PATH,
    "w",
    encoding="utf-8",
) as file:

    json.dump(
        results,
        file,
        indent=4,
    )


print(
    f"New CNN saved to:"
)

print(
    CNN_MODEL_PATH
)

print()

print(
    f"Decision Tree saved to:"
)

print(
    TREE_MODEL_PATH
)

print()

print(
    f"Comparison results saved to:"
)

print(
    RESULTS_PATH
)

print()

print("=" * 75)
print("EXPERIMENT COMPLETE")
print("=" * 75)