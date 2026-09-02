import sys
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image


# ============================================================
# SETTINGS
# ============================================================

MODEL_PATH = Path(__file__).resolve().parent / "model" / "fresh_rotten_model.pth"

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# ============================================================
# IMAGE TRANSFORMATION
# ============================================================

transform = transforms.Compose([
    transforms.Resize((224, 224)),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ============================================================
# LOAD MODEL
# ============================================================

model = models.mobilenet_v2(
    weights=None
)

model.classifier[1] = nn.Linear(
    model.last_channel,
    2
)

model.load_state_dict(
    torch.load(
        MODEL_PATH,
        map_location=DEVICE
    )
)

model = model.to(DEVICE)

model.eval()


# ============================================================
# PREDICT IMAGE
# ============================================================

def predict(image_path):

    image = Image.open(
        image_path
    ).convert("RGB")

    image = transform(image)

    image = image.unsqueeze(0)

    image = image.to(DEVICE)

    with torch.no_grad():

        output = model(image)

        probabilities = torch.softmax(
            output,
            dim=1
        )

        confidence, predicted = torch.max(
            probabilities,
            1
        )

    class_names = [
        "Fresh",
        "Rotten"
    ]

    prediction = class_names[
        predicted.item()
    ]

    confidence = confidence.item()

    return prediction, confidence


# ============================================================
# COMMAND LINE
# ============================================================

if __name__ == "__main__":

    if len(sys.argv) < 2:

        print(
            "Usage: python predict.py <image_path>"
        )

        sys.exit(1)

    image_path = sys.argv[1]

    try:

        prediction, confidence = predict(
            image_path
        )

        print(
            f"Prediction: {prediction}"
        )

        print(
            f"Confidence: {confidence:.4f}"
        )

    except Exception as error:

        print(
            f"Error: {error}"
        )

        sys.exit(1)