import sys
from pathlib import Path

import joblib
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms, models


# ============================================================
# SETTINGS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

CNN_MODEL_PATH = (
    BASE_DIR
    / "model"
    / "fresh_rotten_model.pth"
)

DECISION_TREE_PATH = (
    BASE_DIR
    / "model"
    / "fresh_rotten_decision_tree.joblib"
)

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


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
# LOAD CNN
# ============================================================

cnn_model = models.mobilenet_v2(
    weights=None
)

cnn_model.classifier[1] = nn.Linear(
    cnn_model.last_channel,
    2,
)

cnn_model.load_state_dict(
    torch.load(
        CNN_MODEL_PATH,
        map_location=DEVICE,
    )
)

cnn_model = cnn_model.to(DEVICE)

cnn_model.eval()


# ============================================================
# CNN FEATURE EXTRACTOR
# ============================================================

feature_extractor = nn.Sequential(
    cnn_model.features,

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
# LOAD DECISION TREE
# ============================================================

tree_data = joblib.load(
    DECISION_TREE_PATH
)

decision_tree = tree_data[
    "model"
]

class_names = tree_data[
    "class_names"
]


# ============================================================
# EXTRACT CNN FEATURES
# ============================================================

def extract_features(image_path):

    image = Image.open(
        image_path
    ).convert("RGB")

    image = transform(
        image
    )

    image = image.unsqueeze(
        0
    )

    image = image.to(
        DEVICE
    )

    with torch.no_grad():

        features = (
            feature_extractor(
                image
            )
        )

    features = (
        features
        .cpu()
        .numpy()
    )

    return features


# ============================================================
# PREDICT
# ============================================================

def predict(image_path):

    features = extract_features(
        image_path
    )

    predicted_class = (
        decision_tree.predict(
            features
        )[0]
    )

    probabilities = (
        decision_tree.predict_proba(
            features
        )[0]
    )

    confidence = float(
        probabilities[
            predicted_class
        ]
    )

    prediction = (
        class_names[
            predicted_class
        ]
    )

    return (
        prediction,
        confidence,
        probabilities,
    )


# ============================================================
# COMMAND LINE
# ============================================================

if __name__ == "__main__":

    if len(sys.argv) < 2:

        print(
            "Usage: "
            "python predict_decision_tree.py "
            "<image_path>"
        )

        sys.exit(1)

    image_path = Path(
        sys.argv[1]
    )

    if not image_path.exists():

        print(
            f"Error: Image not found: "
            f"{image_path}"
        )

        sys.exit(1)

    try:

        (
            prediction,
            confidence,
            probabilities,
        ) = predict(
            image_path
        )

        print(
            "=" * 60
        )

        print(
            "CNN FEATURE EXTRACTION "
            "+ DECISION TREE"
        )

        print(
            "=" * 60
        )

        print(
            f"Image: "
            f"{image_path}"
        )

        print()

        print(
            f"Prediction: "
            f"{prediction}"
        )

        print(
            f"Confidence: "
            f"{confidence:.4f}"
        )

        print()

        print(
            f"Fresh probability: "
            f"{probabilities[0]:.4f}"
        )

        print(
            f"Rotten probability: "
            f"{probabilities[1]:.4f}"
        )

    except Exception as error:

        print(
            f"Error: {error}"
        )

        sys.exit(1)