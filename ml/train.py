import random
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from PIL import Image
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from tqdm import tqdm


# ============================================================
# 1. SETTINGS
# ============================================================

DATASET_PATH = Path(
    r"C:\Users\Charmaine\Downloads\archive (1)\Dataset"
)

IMAGES_PER_CLASS = 20000

BATCH_SIZE = 32
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
    ".webp"
}


# ============================================================
# 2. DISPLAY SYSTEM INFORMATION
# ============================================================

print("=" * 60)
print("FOOD FRESHNESS CLASSIFIER")
print("=" * 60)

print(f"Device: {DEVICE}")

if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"CUDA: {torch.version.cuda}")

print()


# ============================================================
# 3. FIND ALL IMAGES
# ============================================================

def get_images(folder):
    """
    Recursively find all image files inside a folder.
    This allows us to use:
    
    Fresh/FreshApple/
    Fresh/FreshBanana/
    etc.
    
    without reorganizing the dataset.
    """

    images = []

    for file in folder.rglob("*"):
        if (
            file.is_file()
            and file.suffix.lower() in IMAGE_EXTENSIONS
        ):
            images.append(file)

    return images


fresh_folder = DATASET_PATH / "Fresh"
rotten_folder = DATASET_PATH / "Rotten"

print("Searching for images...")

fresh_images = get_images(fresh_folder)
rotten_images = get_images(rotten_folder)

print(f"Fresh images found: {len(fresh_images)}")
print(f"Rotten images found: {len(rotten_images)}")
print()


# ============================================================
# 4. BALANCE THE DATASET
# ============================================================

random.seed(RANDOM_SEED)

random.shuffle(fresh_images)
random.shuffle(rotten_images)

fresh_images = fresh_images[:IMAGES_PER_CLASS]
rotten_images = rotten_images[:IMAGES_PER_CLASS]

print("Images selected for training:")
print(f"Fresh: {len(fresh_images)}")
print(f"Rotten: {len(rotten_images)}")
print(f"Total: {len(fresh_images) + len(rotten_images)}")
print()


# ============================================================
# 5. CREATE LABELS
# ============================================================

all_images = fresh_images + rotten_images

all_labels = (
    [0] * len(fresh_images)
    +
    [1] * len(rotten_images)
)


# ============================================================
# 6. TRAIN / VALIDATION / TEST SPLIT
# ============================================================

train_images, temp_images, train_labels, temp_labels = (
    train_test_split(
        all_images,
        all_labels,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=all_labels
    )
)

val_images, test_images, val_labels, test_labels = (
    train_test_split(
        temp_images,
        temp_labels,
        test_size=0.50,
        random_state=RANDOM_SEED,
        stratify=temp_labels
    )
)

print("Dataset split:")
print(f"Training:   {len(train_images)}")
print(f"Validation: {len(val_images)}")
print(f"Testing:    {len(test_images)}")
print()


# ============================================================
# 7. IMAGE TRANSFORMS
# ============================================================

train_transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.RandomHorizontalFlip(),

    transforms.RandomRotation(10),

    transforms.ColorJitter(
        brightness=0.2,
        contrast=0.2,
        saturation=0.2
    ),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


test_transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ============================================================
# 8. CUSTOM DATASET
# ============================================================

class FoodDataset(Dataset):

    def __init__(self, image_paths, labels, transform=None):

        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, index):

        image_path = self.image_paths[index]
        label = self.labels[index]

        try:

            image = Image.open(
                image_path
            ).convert("RGB")

        except Exception as error:

            print(
                f"\nCould not read image: {image_path}"
            )

            raise error

        if self.transform:
            image = self.transform(image)

        return image, label


# ============================================================
# 9. CREATE DATASETS
# ============================================================

train_dataset = FoodDataset(
    train_images,
    train_labels,
    train_transform
)

val_dataset = FoodDataset(
    val_images,
    val_labels,
    test_transform
)

test_dataset = FoodDataset(
    test_images,
    test_labels,
    test_transform
)


# ============================================================
# 10. CREATE DATA LOADERS
# ============================================================

train_loader = DataLoader(
    train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0
)

val_loader = DataLoader(
    val_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0
)

test_loader = DataLoader(
    test_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0
)


# ============================================================
# 11. LOAD MOBILENETV2
# ============================================================

print("Loading MobileNetV2...")

weights = models.MobileNet_V2_Weights.DEFAULT

model = models.mobilenet_v2(
    weights=weights
)

# Change the final layer from 1000 classes
# to our 2 classes:
#
# 0 = Fresh
# 1 = Rotten

model.classifier[1] = nn.Linear(
    model.last_channel,
    2
)

model = model.to(DEVICE)

print("Model loaded.")
print()


# ============================================================
# 12. LOSS FUNCTION AND OPTIMIZER
# ============================================================

criterion = nn.CrossEntropyLoss()

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=LEARNING_RATE
)


# ============================================================
# 13. TRAINING
# ============================================================

best_validation_accuracy = 0.0

model_folder = Path("model")
model_folder.mkdir(exist_ok=True)

model_path = (
    model_folder
    / "fresh_rotten_model.pth"
)

print("=" * 60)
print("STARTING TRAINING")
print("=" * 60)


for epoch in range(NUM_EPOCHS):

    print()
    print(
        f"Epoch {epoch + 1}/{NUM_EPOCHS}"
    )

    # --------------------------------------------------------
    # TRAINING
    # --------------------------------------------------------

    model.train()

    training_correct = 0
    training_total = 0
    training_loss = 0.0

    progress_bar = tqdm(
        train_loader,
        desc="Training"
    )

    for images, labels in progress_bar:

        images = images.to(DEVICE)
        labels = labels.to(DEVICE)

        optimizer.zero_grad()

        outputs = model(images)

        loss = criterion(
            outputs,
            labels
        )

        loss.backward()

        optimizer.step()

        training_loss += loss.item()

        _, predictions = torch.max(
            outputs,
            1
        )

        training_total += labels.size(0)

        training_correct += (
            predictions == labels
        ).sum().item()

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

    model.eval()

    validation_correct = 0
    validation_total = 0

    with torch.no_grad():

        for images, labels in val_loader:

            images = images.to(DEVICE)
            labels = labels.to(DEVICE)

            outputs = model(images)

            _, predictions = torch.max(
                outputs,
                1
            )

            validation_total += labels.size(0)

            validation_correct += (
                predictions == labels
            ).sum().item()

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


    # --------------------------------------------------------
    # SAVE BEST MODEL
    # --------------------------------------------------------

    if validation_accuracy > best_validation_accuracy:

        best_validation_accuracy = (
            validation_accuracy
        )

        torch.save(
            model.state_dict(),
            model_path
        )

        print("✓ Best model saved.")


# ============================================================
# 14. TESTING
# ============================================================

print()
print("=" * 60)
print("TESTING FINAL MODEL")
print("=" * 60)

model.load_state_dict(
    torch.load(
        model_path,
        map_location=DEVICE
    )
)

model.eval()

all_predictions = []
all_labels = []


with torch.no_grad():

    for images, labels in tqdm(
        test_loader,
        desc="Testing"
    ):

        images = images.to(DEVICE)

        outputs = model(images)

        _, predictions = torch.max(
            outputs,
            1
        )

        all_predictions.extend(
            predictions.cpu().numpy()
        )

        all_labels.extend(
            labels.numpy()
        )


# ============================================================
# 15. CLASSIFICATION REPORT
# ============================================================

print()
print("=" * 60)
print("CLASSIFICATION REPORT")
print("=" * 60)

print(
    classification_report(
        all_labels,
        all_predictions,
        target_names=[
            "Fresh",
            "Rotten"
        ]
    )
)


# ============================================================
# 16. CONFUSION MATRIX
# ============================================================

print("Confusion Matrix:")

matrix = confusion_matrix(
    all_labels,
    all_predictions
)

print(matrix)


# ============================================================
# 17. FINISHED
# ============================================================

print()
print("=" * 60)
print("TRAINING COMPLETE")
print("=" * 60)

print(
    f"Best validation accuracy: "
    f"{best_validation_accuracy:.4f}"
)

print(
    f"Model saved to: {model_path}"
)