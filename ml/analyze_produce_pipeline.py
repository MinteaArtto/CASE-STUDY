import json
import re
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
EXTENDED_DETECTOR_PATH = (
    BASE_DIR / "model" / "produce_detector_extension" / "weights" / "best.pt"
)
TROPICAL_DETECTOR_PATH = (
    BASE_DIR / "model" / "produce_detector_tropical_20261114" / "weights" / "best.pt"
)
TROPICAL_DETECTOR_METRICS_PATH = (
    BASE_DIR / "model" / "produce_detector_tropical_20261114" / "candidate_metrics.json"
)
CARTOON_CLASSIFIER_PATH = (
    BASE_DIR / "model" / "cartoon_rejection_pilot" / "weights" / "best.pt"
)
RIPENESS_PATH = BASE_DIR / "model" / "ripeness" / "ripeness_tree.joblib"
RIPENESS_METRICS_PATH = BASE_DIR / "model" / "ripeness" / "ripeness_metrics.json"
EXTENDED_RIPENESS_TREE_PATH = (
    BASE_DIR / "model" / "ripeness_tree_extension" / "ripeness_tree.joblib"
)
EXTENDED_RIPENESS_METRICS_PATH = (
    BASE_DIR / "model" / "ripeness_tree_extension" / "ripeness_metrics.json"
)
EXTENDED_RIPENESS_CNN_PATH = (
    BASE_DIR / "model" / "ripeness_cnn_extension" / "weights" / "best.pt"
)
EXTENDED_RIPENESS_CNN_METRICS_PATH = (
    BASE_DIR / "model" / "ripeness_cnn_extension" / "ripeness_metrics.json"
)
NEW_RIPENESS_CNN_PATH = (
    BASE_DIR / "model" / "ripeness_new_fruits_20261114" / "weights" / "best.pt"
)
NEW_RIPENESS_CNN_METRICS_PATH = (
    BASE_DIR / "model" / "ripeness_new_fruits_20261114" / "candidate_metrics.json"
)
ILLUSTRATION_REJECTION_THRESHOLD = 0.95
DETECTOR_MERGE_IOU_THRESHOLD = 0.5
MAX_IDENTITY_CANDIDATES = 3

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
EXTENDED_RIPENESS_CLASSES = {
    "papaya",
    "pineapple",
    "rambutan",
    "strawberry",
}
NEW_RIPENESS_CLASSES = {
    "avocado",
    "banana",
    "dragon_fruit",
    "mango",
    "papaya",
    "pineapple",
    "rambutan",
    "strawberry",
    "tomato",
}
NEW_ONLY_RIPENESS_CLASSES = {"avocado", "dragon_fruit", "tomato"}
NEW_ONLY_RIPENESS_STAGES = {
    "avocado": {"Overripe", "Ripe", "Unripe"},
    "dragon_fruit": {"Ripe", "Unripe"},
    "tomato": {"Ripe", "Turning", "Unripe"},
}
NEW_RIPENESS_SHARED_STAGES = {"Overripe", "Ripe", "Unripe"}

DETECTOR_CLASS_ALIASES = {
    "ampalaya": "bitter_gourd",
    "atis": "sugar_apple",
    "caimito": "star_apple",
    "guyabano": "soursop",
    "kamatis": "tomato",
    "kangkong": "water_spinach",
    "sampalok": "tamarind",
    "repolyo": "cabbage",
    "sayote": "chayote",
    "sitaw": "yardlong_bean",
    "talong": "eggplant",
    "upo": "bottle_gourd",
}

DISPLAY_NAMES = {
    "ampalaya": "Bitter gourd (ampalaya)",
    "atis": "Sugar apple (atis)",
    "caimito": "Star apple (caimito)",
    "guyabano": "Soursop (guyabano)",
    "kamatis": "Tomato (kamatis)",
    "kangkong": "Water spinach (kangkong)",
    "sampalok": "Tamarind (sampalok)",
    "repolyo": "Cabbage (repolyo)",
    "sayote": "Chayote (sayote)",
    "sitaw": "Yardlong bean (sitaw)",
    "talong": "Eggplant (talong)",
    "upo": "Bottle gourd (upo)",
}


def load_ripeness_tree(path):
    if not path.is_file():
        raise FileNotFoundError(f"Ripeness model not found: {path}")

    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or "model" not in bundle:
        raise ValueError(f"Invalid ripeness model bundle: {path}")

    classifier = bundle["model"]
    feature_dim = bundle.get("feature_dim")
    if feature_dim != 1280 or getattr(classifier, "n_features_in_", None) != 1280:
        raise ValueError(
            f"Ripeness model expects 1280-dimensional MobileNetV2 features: {path}"
        )
    return classifier


def load_ripeness_models():
    required_files = (
        RIPENESS_PATH,
        RIPENESS_METRICS_PATH,
        EXTENDED_RIPENESS_TREE_PATH,
        EXTENDED_RIPENESS_METRICS_PATH,
        EXTENDED_RIPENESS_CNN_PATH,
        EXTENDED_RIPENESS_CNN_METRICS_PATH,
        NEW_RIPENESS_CNN_PATH,
        NEW_RIPENESS_CNN_METRICS_PATH,
    )
    for path in required_files:
        if not path.is_file():
            raise FileNotFoundError(f"Required ripeness model file not found: {path}")

    active_classifier = load_ripeness_tree(RIPENESS_PATH)
    extended_tree = load_ripeness_tree(EXTENDED_RIPENESS_TREE_PATH)
    metrics = json.loads(RIPENESS_METRICS_PATH.read_text(encoding="utf-8"))
    extended_metrics = json.loads(
        EXTENDED_RIPENESS_METRICS_PATH.read_text(encoding="utf-8")
    )
    extended_cnn_metrics = json.loads(
        EXTENDED_RIPENESS_CNN_METRICS_PATH.read_text(encoding="utf-8")
    )
    new_cnn_metrics = json.loads(
        NEW_RIPENESS_CNN_METRICS_PATH.read_text(encoding="utf-8")
    )
    feature_model = models.mobilenet_v2(
        weights=models.MobileNet_V2_Weights.IMAGENET1K_V1
    )
    feature_model.classifier = torch.nn.Identity()
    feature_model = feature_model.to(DEVICE)
    feature_model.eval()

    extended_cnn = YOLO(str(EXTENDED_RIPENESS_CNN_PATH))
    expected_stages = {"Unripe", "Ripe", "Overripe"}
    if set(extended_cnn.names.values()) != expected_stages:
        raise ValueError(
            "Extended ripeness CNN must predict Unripe, Ripe, and Overripe."
        )
    new_cnn = YOLO(str(NEW_RIPENESS_CNN_PATH))
    expected_new_stages = {"Overripe", "Ripe", "Semi-ripe", "Turning", "Unripe"}
    if set(new_cnn.names.values()) != expected_new_stages:
        raise ValueError(
            "The new ripeness candidate must predict Overripe, Ripe, Semi-ripe, "
            "Turning, and Unripe."
        )

    return {
        "active_classifier": active_classifier,
        "active_metrics": metrics,
        "extended_tree": extended_tree,
        "extended_tree_metrics": extended_metrics,
        "extended_cnn": extended_cnn,
        "extended_cnn_metrics": extended_cnn_metrics,
        "new_cnn": new_cnn,
        "new_cnn_metrics": new_cnn_metrics,
        "feature_model": feature_model,
    }


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


def cnn_ripeness_prediction(image, classifier, model_name):
    result = classifier.predict(
        source=image,
        imgsz=224,
        verbose=False,
    )[0]
    if result.probs is None:
        raise RuntimeError(f"The {model_name} returned no class scores.")

    probabilities = result.probs.data.detach().cpu().numpy()
    classes = [str(result.names[index]) for index in range(len(probabilities))]
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


def extended_cnn_prediction(image, classifier):
    return cnn_ripeness_prediction(image, classifier, "extended ripeness classifier")


def new_cnn_prediction(image, classifier):
    return cnn_ripeness_prediction(image, classifier, "new ripeness candidate")


def canonical_detector_name(name):
    normalized = re.sub(r"[^a-z0-9]+", "_", str(name).strip().casefold()).strip("_")
    return DETECTOR_CLASS_ALIASES.get(normalized, normalized)


def box_iou(first, second):
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[2], second[2])
    bottom = min(first[3], second[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    first_area = max(0.0, first[2] - first[0]) * max(0.0, first[3] - first[1])
    second_area = max(0.0, second[2] - second[0]) * max(0.0, second[3] - second[1])
    union = first_area + second_area - intersection
    return intersection / union if union else 0.0


def group_detector_predictions(predictions):
    groups = []
    for prediction in sorted(
        predictions, key=lambda item: item["confidence"], reverse=True
    ):
        best_group = None
        best_iou = 0.0
        for group in groups:
            overlap = box_iou(prediction["coordinates"], group["coordinates"])
            if overlap > best_iou:
                best_iou = overlap
                best_group = group

        if best_group is not None and best_iou >= DETECTOR_MERGE_IOU_THRESHOLD:
            best_group["predictions"].append(prediction)
        else:
            groups.append({
                "coordinates": prediction["coordinates"],
                "predictions": [prediction],
            })
    return groups


def identity_candidates(predictions):
    candidates_by_name = {}
    for prediction in predictions:
        normalized_name = canonical_detector_name(prediction["class_name"])
        candidate = candidates_by_name.setdefault(
            normalized_name,
            {
                "normalizedName": normalized_name,
                "label": DISPLAY_NAMES.get(
                    prediction["class_name"].strip().casefold(),
                    prediction["class_name"].replace("_", " ").title(),
                ),
                "scoresByModel": {},
                "classIdsByModel": {},
            },
        )
        model_name = prediction["model"]
        if prediction["confidence"] > candidate["scoresByModel"].get(model_name, -1):
            candidate["scoresByModel"][model_name] = prediction["confidence"]
            candidate["classIdsByModel"][model_name] = prediction["class_id"]

    candidates = sorted(
        candidates_by_name.values(),
        key=lambda candidate: (
            next(
                (
                    priority
                    for priority, model_name in enumerate(
                        ("active", "extended", "tropical")
                    )
                    if model_name in candidate["scoresByModel"]
                ),
                3,
            ),
            -candidate["scoresByModel"].get(
                "active",
                candidate["scoresByModel"].get(
                    "extended",
                    candidate["scoresByModel"].get("tropical", 0.0),
                ),
            ),
        ),
    )
    return [
        {
            **candidate,
            "modelScores": [
                {"model": model_name, "score": round(score, 4)}
                for model_name, score in sorted(candidate["scoresByModel"].items())
            ],
        }
        for candidate in candidates[:MAX_IDENTITY_CANDIDATES]
    ]


def preferred_detector_model(candidate):
    for model_name in ("active", "extended", "tropical"):
        if model_name in candidate["classIdsByModel"]:
            return model_name
    raise ValueError("Detector candidate has no source model.")


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
    ripeness_models,
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

    normalized_name = canonical_detector_name(produce_name)
    if normalized_name in NEW_ONLY_RIPENESS_CLASSES:
        candidate_result = new_cnn_prediction(
            crop,
            ripeness_models["new_cnn"],
        )
        candidate_predictions = {
            "newImageClassifier": {
                "label": candidate_result["label"],
                "score": candidate_result["score"],
            },
        }
        if candidate_result["label"] not in NEW_ONLY_RIPENESS_STAGES[normalized_name]:
            return {
                "status": "uncertain",
                "label": "Uncertain",
                "score": None,
                "probabilities": None,
                "message": (
                    "The experimental candidate predicted a ripeness stage without "
                    "held-out test support for this fruit. Inspect it manually."
                ),
                "candidatePredictions": candidate_predictions,
            }

        return {
            **candidate_result,
            "model": "new_ripeness_candidate",
            "experimental": True,
            "message": (
                "Experimental ripeness candidate: no existing fruit-specific "
                "ripeness model is available to confirm this result. Verify manually."
            ),
            "candidatePredictions": candidate_predictions,
        }

    if normalized_name in SUPPORTED_RIPENESS_CLASSES:
        active_result = ripeness_prediction(
            crop,
            ripeness_models["active_classifier"],
            ripeness_models["feature_model"],
        )
        if normalized_name not in NEW_RIPENESS_CLASSES:
            return active_result

        candidate_result = new_cnn_prediction(crop, ripeness_models["new_cnn"])
        candidate_predictions = {
            "activeClassifier": {
                "label": active_result["label"],
                "score": active_result["score"],
            },
            "newImageClassifier": {
                "label": candidate_result["label"],
                "score": candidate_result["score"],
            },
        }
        if (
            active_result["label"] != candidate_result["label"]
            or candidate_result["label"] not in NEW_RIPENESS_SHARED_STAGES
        ):
            return {
                "status": "uncertain",
                "label": "Uncertain",
                "score": None,
                "probabilities": None,
                "message": (
                    "The existing ripeness model and experimental candidate do not "
                    "agree on a supported stage. Inspect the item manually."
                ),
                "candidatePredictions": candidate_predictions,
            }

        return {
            **active_result,
            "model": "active_tandem",
            "experimental": True,
            "message": (
                "The existing ripeness model and experimental candidate agree. "
                "Confirm the result manually."
            ),
            "candidatePredictions": candidate_predictions,
        }

    if normalized_name not in EXTENDED_RIPENESS_CLASSES:
        return {
            "status": "unsupported",
            "label": None,
            "score": None,
            "message": "No ripeness model is trained for this produce class.",
        }

    tree_result = ripeness_prediction(
        crop,
        ripeness_models["extended_tree"],
        ripeness_models["feature_model"],
    )
    cnn_result = extended_cnn_prediction(
        crop,
        ripeness_models["extended_cnn"],
    )
    new_cnn_result = new_cnn_prediction(
        crop,
        ripeness_models["new_cnn"],
    )
    candidate_predictions = {
        "tree": {
            "label": tree_result["label"],
            "score": tree_result["score"],
        },
        "imageClassifier": {
            "label": cnn_result["label"],
            "score": cnn_result["score"],
        },
        "newImageClassifier": {
            "label": new_cnn_result["label"],
            "score": new_cnn_result["score"],
        },
    }

    votes = [tree_result, cnn_result]
    if new_cnn_result["label"] in NEW_RIPENESS_SHARED_STAGES:
        votes.append(new_cnn_result)
    vote_counts = {}
    for prediction in votes:
        vote_counts[prediction["label"]] = vote_counts.get(prediction["label"], 0) + 1
    winning_label, winning_votes = max(
        vote_counts.items(),
        key=lambda item: item[1],
    )

    if winning_votes < 2:
        return {
            "status": "uncertain",
            "label": "Uncertain",
            "score": None,
            "probabilities": None,
            "message": (
                "The ripeness models do not reach a two-model consensus. "
                "Inspect the item manually."
            ),
            "candidatePredictions": candidate_predictions,
        }

    if winning_label == "Overripe" and normalized_name != "pineapple":
        return {
            "status": "uncertain",
            "label": "Uncertain",
            "score": None,
            "probabilities": None,
            "message": (
                "Overripe has no held-out examples for this fruit in the extension "
                "data, so this prediction needs manual confirmation."
            ),
            "candidatePredictions": candidate_predictions,
        }

    supporting_prediction = next(
        prediction for prediction in votes if prediction["label"] == winning_label
    )
    return {
        **supporting_prediction,
        "model": "extended_tandem",
        "experimental": True,
        "message": (
            f"Experimental extension: {winning_votes} ripeness models agree. "
            "Confirm the result manually."
        ),
        "candidatePredictions": candidate_predictions,
    }


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
    if ripeness["label"] in {"Semi-ripe", "Turning"}:
        return (
            "The item appears to be transitioning in ripeness. This experimental "
            "stage prediction needs manual confirmation before deciding when to use it."
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

    for detector_path in (DETECTOR_PATH, EXTENDED_DETECTOR_PATH, TROPICAL_DETECTOR_PATH):
        if not detector_path.is_file():
            raise FileNotFoundError(f"Produce detector not found: {detector_path}")
    if not TROPICAL_DETECTOR_METRICS_PATH.is_file():
        raise FileNotFoundError(
            f"Tropical detector metrics not found: {TROPICAL_DETECTOR_METRICS_PATH}"
        )

    detector = YOLO(str(DETECTOR_PATH))
    extended_detector = YOLO(str(EXTENDED_DETECTOR_PATH))
    tropical_detector = YOLO(str(TROPICAL_DETECTOR_PATH))
    tropical_detector_metrics = json.loads(
        TROPICAL_DETECTOR_METRICS_PATH.read_text(encoding="utf-8")
    )
    active_result = detector.predict(
        source=image,
        conf=0.25,
        max_det=20,
        verbose=False,
    )[0]
    extended_result = extended_detector.predict(
        source=image,
        conf=0.25,
        max_det=20,
        verbose=False,
    )[0]
    tropical_result = tropical_detector.predict(
        source=image,
        conf=0.25,
        max_det=20,
        verbose=False,
    )[0]

    detector_predictions = []
    for model_name, result in (
        ("active", active_result),
        ("extended", extended_result),
        ("tropical", tropical_result),
    ):
        if result.boxes is None:
            continue
        for box in result.boxes:
            class_id = int(box.cls.item())
            detector_predictions.append({
                "model": model_name,
                "class_id": class_id,
                "class_name": str(result.names[class_id]),
                "confidence": float(box.conf.item()),
                "coordinates": [float(value) for value in box.xyxy[0].tolist()],
            })

    detected_objects = group_detector_predictions(detector_predictions)
    detected_objects.sort(
        key=lambda group: max(
            prediction["confidence"] for prediction in group["predictions"]
        ),
        reverse=True,
    )
    detected_objects = detected_objects[:20]
    if not detected_objects:
        return {
            "success": True,
            "status": "no_detections",
            "message": "No fruit or vegetable was detected with sufficient score.",
            "imageValidation": image_validation,
            "detections": [],
        }

    pipeline_models = load_pipeline_models()
    ripeness_models = load_ripeness_models()
    detections = []

    with tempfile.TemporaryDirectory(prefix="produce-classifier-") as temp_dir:
        for index, detected_object in enumerate(detected_objects, start=1):
            coordinates = detected_object["coordinates"]
            crop = crop_with_padding(image, coordinates)
            crop_path = Path(temp_dir) / f"produce-{index}.jpg"
            freshness = classify_freshness(crop, crop_path, pipeline_models)
            candidates = identity_candidates(detected_object["predictions"])
            if not candidates:
                continue

            candidate_results = []
            for candidate in candidates:
                preferred_model = preferred_detector_model(candidate)
                ripeness = classify_ripeness(
                    candidate["normalizedName"],
                    freshness,
                    crop,
                    ripeness_models,
                )
                candidate_results.append({
                    "produce": {
                        "label": candidate["label"],
                        "classId": candidate["classIdsByModel"][preferred_model],
                        "detectorModel": preferred_model,
                        "confidence": candidate["scoresByModel"][preferred_model],
                        "modelScores": candidate["modelScores"],
                    },
                    "freshness": freshness,
                    "ripeness": ripeness,
                    "recommendation": recommendation_for(freshness, ripeness),
                })

            primary_candidate = candidate_results[0]
            primary_candidate["produce"]["box"] = {
                "x1": round(coordinates[0], 2),
                "y1": round(coordinates[1], 2),
                "x2": round(coordinates[2], 2),
                "y2": round(coordinates[3], 2),
            }
            detections.append({
                **primary_candidate,
                "candidates": candidate_results,
            })

    return {
        "success": True,
        "status": "classified",
        "message": f"Analyzed {len(detections)} detected produce item(s).",
        "imageValidation": image_validation,
        "detections": detections,
        "modelEvaluation": {
            "ripenessTestAccuracy": ripeness_models["active_metrics"]["test_accuracy"],
            "ripenessTestMacroF1": ripeness_models["active_metrics"]["test_macro_f1"],
            "ripenessSupportedClasses": sorted(
                SUPPORTED_RIPENESS_CLASSES
            ),
            "extendedRipenessClasses": sorted(EXTENDED_RIPENESS_CLASSES),
            "newRipenessCandidateTestAccuracy": ripeness_models[
                "new_cnn_metrics"
            ]["test"]["top1_accuracy"],
            "newRipenessCandidateTestSamples": ripeness_models[
                "new_cnn_metrics"
            ]["test"]["samples"],
            "newRipenessClasses": sorted(NEW_RIPENESS_CLASSES),
            "tropicalDetectorCandidate": {
                "classes": len(tropical_detector_metrics["classes"]),
                "testImages": tropical_detector_metrics["images_per_split"]["test"],
                "testMap50": tropical_detector_metrics["test_metrics"][
                    "metrics/mAP50(B)"
                ],
                "classesWithoutTestSamples": sorted(
                    set(tropical_detector_metrics["classes"].values())
                    - set(tropical_detector_metrics["test_class_metrics"])
                ),
            },
            "extendedRipenessModels": {
                "treeTestAccuracy": ripeness_models["extended_tree_metrics"][
                    "test_accuracy"
                ],
                "treeTestMacroF1": ripeness_models["extended_tree_metrics"][
                    "test_macro_f1"
                ],
                "imageClassifierTestAccuracy": ripeness_models[
                    "extended_cnn_metrics"
                ]["test_accuracy"],
                "imageClassifierTestSamples": ripeness_models[
                    "extended_cnn_metrics"
                ]["test_samples"],
            },
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
