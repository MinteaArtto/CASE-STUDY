from pathlib import Path
import sys

import joblib
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms


# ============================================================
# SETTINGS
# ============================================================

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
# LOAD CALIBRATED OOD MODEL
# ============================================================

ood_data = joblib.load(
    OOD_MODEL_PATH
)

scaler = ood_data[
    "scaler"
]

knn = ood_data[
    "knn"
]

k_neighbors = ood_data[
    "k_neighbors"
]

p95 = ood_data[
    "p95"
]

p97 = ood_data[
    "p97"
]

p99 = ood_data[
    "p99"
]


# ============================================================
# EXTRACT FEATURE
# ============================================================

def extract_feature(
    image_path
):

    image = Image.open(
        image_path
    ).convert(
        "RGB"
    )

    image = transform(
        image
    )

    image = image.unsqueeze(
        0
    ).to(
        DEVICE
    )

    with torch.no_grad():

        feature = (
            feature_extractor(
                image
            )
        )

    return (
        feature
        .cpu()
        .numpy()
    )


# ============================================================
# CHECK OOD
# ============================================================

def check_ood(
    image_path
):

    feature = extract_feature(
        image_path
    )

    scaled_feature = scaler.transform(
        feature
    )

    distances, indices = (
        knn.kneighbors(
            scaled_feature,
            n_neighbors=k_neighbors,
        )
    )

    distances = distances[0]

    mean_distance = float(
        np.mean(
            distances
        )
    )

    nearest_distance = float(
        distances[0]
    )


    if mean_distance <= p95:

        status = "FAMILIAR"

    elif mean_distance <= p97:

        status = "SLIGHTLY UNFAMILIAR"

    elif mean_distance <= p99:

        status = "BORDERLINE / ACCEPTABLE"

    else:

        status = "OUT-OF-DISTRIBUTION"


    accepted = (
        mean_distance <= p99
    )


    return {
        "nearest_distance":
            nearest_distance,

        "mean_knn_distance":
            mean_distance,

        "status":
            status,

        "accepted":
            accepted,

        "p95":
            p95,

        "p97":
            p97,

        "p99":
            p99,
    }


# ============================================================
# COMMAND LINE
# ============================================================

if __name__ == "__main__":

    if len(sys.argv) < 2:

        print(
            "Usage:"
        )

        print(
            "python test_knn_ood_calibrated.py "
            "\"path_to_image.jpg\""
        )

        raise SystemExit(1)


    image_path = sys.argv[1]

    result = check_ood(
        image_path
    )


    print()
    print("=" * 65)
    print("CALIBRATED KNN OOD TEST")
    print("=" * 65)

    print(
        "Image:"
    )

    print(
        image_path
    )

    print()

    print(
        f"Nearest-neighbor distance: "
        f"{result['nearest_distance']:.4f}"
    )

    print(
        f"Mean {k_neighbors}-NN distance: "
        f"{result['mean_knn_distance']:.4f}"
    )

    print()

    print(
        f"95th percentile: "
        f"{result['p95']:.4f}"
    )

    print(
        f"97th percentile: "
        f"{result['p97']:.4f}"
    )

    print(
        f"99th percentile: "
        f"{result['p99']:.4f}"
    )

    print()

    print(
        f"Status: "
        f"{result['status']}"
    )

    print(
        f"Accepted for spoilage classification: "
        f"{result['accepted']}"
    )

    print()
    print("=" * 65)