import json
import sys
import tempfile
from pathlib import Path

import joblib
import numpy as np
import torch
from PIL import Image, ImageOps
from torchvision import models, transforms
from ultralytics import YOLO

from analyze_spoilage_pipeline import (
    DEVICE,
    analyze_image as analyze_freshness,
    load_pipeline_models,
)


BASE_DIR = Path(__file__).resolve().parent
DETECTOR_PATH = (
    BASE_DIR / "model" / "produce_detector_expanded" / "weights" / "best.pt"
)
CARTOON_CLASSIFIER_PATH = (
    BASE_DIR / "model" / "cartoon_rejection_pilot" / "weights" / "best.pt"
)
RIPENESS_PATH = BASE_DIR / "model" / "ripeness" / "ripeness_tree.joblib"
RIPENESS_METRICS_PATH = BASE_DIR / "model" / "ripeness" / "ripeness_metrics.json"
ILLUSTRATION_REJECTION_THRESHOLD = 0.95

RIPENESS_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])

SUPPORTED_RIPENESS_CLASSES = {
    "apple",
    "banana",
    "grape",
    "mango",
    "melon",
    "orange",
    "peach",
    "pear",
}

DISPLAY_NAMES = {
    "ampalaya": "Bitter gourd (ampalaya)",
    "kamatis": "Tomato (kamatis)",
    "kangkong": "Water spinach (kangkong)",
    "repolyo": "Cabbage (repolyo)",
    "sayote": "Chayote (sayote)",
    "sitaw": "Yardlong bean (sitaw)",
    "talong": "Eggplant (talong)",
    "upo": "Bottle gourd (upo)",
}


def load_ripeness_models():
    if not RIPENESS_PATH.is_file():
        raise FileNotFoundError(f"Ripeness model not found: {RIPENESS_PATH}")
    if not RIPENESS_METRICS_PATH.is_file():
        raise FileNotFoundError(
            f"Ripeness evaluation metrics not found: {RIPENESS_METRICS_PATH}"
        )

    bundle = joblib.load(RIPENESS_PATH)
    if not isinstance(bundle, dict) or "model" not in bundle:
        raise ValueError(f"Invalid ripeness model bundle: {RIPENESS_PATH}")
    classifier = bundle["model"]
    feature_dim = bundle.get("feature_dim")
    if feature_dim != 1280 or getattr(classifier, "n_features_in_", None) != 1280:
        raise ValueError("Ripeness model expects 1280-dimensional MobileNetV2 features.")

    metrics = json.loads(RIPENESS_METRICS_PATH.read_text(encoding="utf-8"))
    feature_model = models.mobilenet_v2(
        weights=models.MobileNet_V2_Weights.IMAGENET1K_V1
    )
    feature_model.classifier = torch.nn.Identity()
    feature_model = feature_model.to(DEVICE)
    feature_model.eval()

    return classifier, feature_model, metrics


def ripeness_prediction(image, classifier, feature_model):
    tensor = RIPENESS_TRANSFORM(image).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        features = feature_model(tensor).cpu().numpy()

    probabilities = classifier.predict_proba(features)[0]
    classes = [str(value) for value in classifier.classes_]
    scores = {
        label: round(float(probability), 4)
        for label, probability in zip(classes, probabilities)
    }
    top_index = int(np.argmax(probabilities))

    return {
        "status": "classified",
        "label": classes[top_index],
        "score": round(float(probabilities[top_index]), 4),
        "probabilities": scores,
    }


def crop_with_padding(image, box):
    x1, y1, x2, y2 = box
    padding_x = int((x2 - x1) * 0.05)
    padding_y = int((y2 - y1) * 0.05)
    left = max(0, int(x1) - padding_x)
    top = max(0, int(y1) - padding_y)
    right = min(image.width, int(x2) + padding_x)
    bottom = min(image.height, int(y2) + padding_y)
    if right <= left or bottom <= top:
        raise ValueError("Detector returned an invalid produce bounding box.")
    return image.crop((left, top, right, bottom))


def check_image_type(image, classifier):
    result = classifier.predict(
        source=image,
        imgsz=224,
        verbose=False,
    )[0]
    if result.probs is None:
        raise RuntimeError("The illustration classifier returned no class scores.")

    scores = {
        str(result.names[index]).lower(): float(score)
        for index, score in enumerate(result.probs.data.tolist())
    }
    if "cartoon" not in scores or "photo" not in scores:
        raise ValueError("The illustration classifier is missing required classes.")

    cartoon_score = scores["cartoon"]
    photo_score = scores["photo"]
    return {
        "label": "Illustration" if cartoon_score >= photo_score else "Likely photo",
        "score": round(max(cartoon_score, photo_score), 4),
        "cartoonScore": round(cartoon_score, 4),
        "photoScore": round(photo_score, 4),
        "rejected": cartoon_score >= ILLUSTRATION_REJECTION_THRESHOLD,
    }


def classify_freshness(crop, image_path, pipeline_models):
    crop.save(image_path, format="JPEG", quality=95)
    result = analyze_freshness(image_path, pipeline_models)
    if result.get("success") is not True:
        raise RuntimeError(result.get("message", "Freshness analysis failed."))

    if result.get("status") == "classified" and result.get("spoilage"):
        spoilage = result["spoilage"]
        return {
            "status": "classified",
            "label": spoilage["prediction"],
            "score": spoilage["tree_probability"],
            "probabilities": spoilage["probabilities"],
            "novelty": result.get("ood"),
        }

    if result.get("status") == "unfamiliar_produce":
        return {
            "status": "uncertain",
            "label": "Uncertain",
            "score": None,
            "probabilities": None,
            "message": result["message"],
            "novelty": result.get("ood"),
        }

    return {
        "status": "not_evaluated",
        "label": "Not evaluated",
        "score": None,
        "probabilities": None,
        "message": result.get("message", "Freshness could not be evaluated."),
        "novelty": result.get("ood"),
    }


def classify_ripeness(
    produce_name,
    freshness,
    crop,
    classifier,
    feature_model,
):
    if freshness["label"] != "Fresh":
        return {
            "status": "not_evaluated",
            "label": None,
            "score": None,
            "message": (
                "Ripeness is not assessed unless the freshness classifier "
                "classifies the item as Fresh."
            ),
        }

    if produce_name.lower() not in SUPPORTED_RIPENESS_CLASSES:
        return {
            "status": "unsupported",
            "label": None,
            "score": None,
            "message": (
                "The ripeness model is trained for apple, banana, grape, mango, "
                "melon, orange, peach, and pear only."
            ),
        }

    return ripeness_prediction(crop, classifier, feature_model)


def recommendation_for(freshness, ripeness):
    if freshness["label"] == "Rotten":
        return (
            "Do not eat based on this image result. Remove and discard the item, "
            "and inspect nearby produce for visible spoilage."
        )
    if freshness["label"] != "Fresh":
        return (
            "The condition is uncertain. Inspect the item manually; if it has "
            "mold, leaking, an unusual odor, or other spoilage signs, discard it."
        )
    if ripeness["status"] == "unsupported":
        return (
            "The item appears fresh, but its ripeness is not covered by this model. "
            "Check it manually and store it appropriately for this produce type."
        )
    if ripeness["status"] != "classified":
        return (
            "The item appears fresh, but ripeness was not evaluated. Inspect it "
            "manually and follow normal storage guidance."
        )
    if ripeness["label"] == "Unripe":
        return (
            "The item appears fresh and unripe. Allow it to ripen if appropriate "
            "for this produce type, and check it again before use."
        )
    if ripeness["label"] == "Overripe":
        return (
            "The item appears fresh but overripe. Use it soon only if there are no "
            "spoilage signs; discard it if mold, leaking, or an unusual odor is present."
        )
    return (
        "The item appears fresh and ripe. Consume or store it according to the "
        "usual guidance for this produce type."
    )


def analyze_produce_image(image_path):
    image_path = Path(image_path)
    if not image_path.is_file():
        raise FileNotFoundError(f"Image file does not exist: {image_path}")

    with Image.open(image_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")

    illustration_classifier = YOLO(str(CARTOON_CLASSIFIER_PATH))
    image_validation = check_image_type(image, illustration_classifier)
    if image_validation["rejected"]:
        return {
            "success": True,
            "status": "rejected_illustration",
            "message": (
                "The image looks like an illustration. Upload a clear photo "
                "of real produce instead."
            ),
            "imageValidation": image_validation,
            "detections": [],
        }

    detector = YOLO(str(DETECTOR_PATH))
    detection_result = detector.predict(
        source=image,
        conf=0.25,
        max_det=20,
        verbose=False,
    )[0]

    if detection_result.boxes is None or len(detection_result.boxes) == 0:
        return {
            "success": True,
            "status": "no_detections",
            "message": "No fruit or vegetable was detected with sufficient score.",
            "imageValidation": image_validation,
            "detections": [],
        }

    pipeline_models = load_pipeline_models()
    ripeness_classifier, ripeness_feature_model, ripeness_metrics = (
        load_ripeness_models()
    )
    detections = []

    with tempfile.TemporaryDirectory(prefix="produce-classifier-") as temp_dir:
        for index, box in enumerate(detection_result.boxes, start=1):
            coordinates = [float(value) for value in box.xyxy[0].tolist()]
            class_id = int(box.cls.item())
            class_name = str(detection_result.names[class_id])
            normalized_name = class_name.strip().lower()
            crop = crop_with_padding(image, coordinates)
            crop_path = Path(temp_dir) / f"produce-{index}.jpg"
            freshness = classify_freshness(crop, crop_path, pipeline_models)
            ripeness = classify_ripeness(
                normalized_name,
                freshness,
                crop,
                ripeness_classifier,
                ripeness_feature_model,
            )

            detections.append({
                "produce": {
                    "label": DISPLAY_NAMES.get(
                        normalized_name,
                        class_name.replace("_", " ").title(),
                    ),
                    "classId": class_id,
                    "confidence": round(float(box.conf.item()), 4),
                    "box": {
                        "x1": round(coordinates[0], 2),
                        "y1": round(coordinates[1], 2),
                        "x2": round(coordinates[2], 2),
                        "y2": round(coordinates[3], 2),
                    },
                },
                "freshness": freshness,
                "ripeness": ripeness,
                "recommendation": recommendation_for(freshness, ripeness),
            })

    return {
        "success": True,
        "status": "classified",
        "message": f"Analyzed {len(detections)} detected produce item(s).",
        "imageValidation": image_validation,
        "detections": detections,
        "modelEvaluation": {
            "ripenessTestAccuracy": ripeness_metrics["test_accuracy"],
            "ripenessTestMacroF1": ripeness_metrics["test_macro_f1"],
            "ripenessSupportedClasses": sorted(SUPPORTED_RIPENESS_CLASSES),
        },
        "scoreNote": (
            "Per-item scores are model outputs, not guarantees of correctness "
            "or food safety."
        ),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "status": "error",
            "message": "Usage: python analyze_produce_pipeline.py <image_path>",
        }))
        raise SystemExit(2)

    try:
        print(json.dumps(analyze_produce_image(sys.argv[1]), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({
            "success": False,
            "status": "error",
            "message": str(error),
        }, ensure_ascii=False))
        raise SystemExit(1)
