import gc
import json
import sys
import tempfile
from pathlib import Path

import torch

torch.set_num_threads(1)
torch.set_num_interop_threads(1)

from PIL import Image, ImageOps
from ultralytics import YOLO

from analyze_produce_pipeline import (
    CARTOON_CLASSIFIER_PATH,
    DETECTOR_PATH,
    EXTENDED_DETECTOR_PATH,
    EXTENDED_RIPENESS_CLASSES,
    NEW_ONLY_RIPENESS_CLASSES,
    NEW_RIPENESS_CLASSES,
    SUPPORTED_RIPENESS_CLASSES,
    TROPICAL_DETECTOR_METRICS_PATH,
    TROPICAL_DETECTOR_PATH,
    check_image_type,
    classify_ripeness,
    crop_with_padding,
    group_detector_predictions,
    identity_candidates,
    load_ripeness_models,
    preferred_detector_model,
    recommendation_for,
)
from analyze_spoilage_pipeline import (
    analyze_image as analyze_freshness,
    load_pipeline_models,
)


def collect_detector_predictions(image, model_name, model_path):
    if not model_path.is_file():
        raise FileNotFoundError(f"Produce detector not found: {model_path}")

    detector = YOLO(str(model_path))
    result = detector.predict(
        source=image,
        imgsz=640,
        conf=0.25,
        max_det=20,
        verbose=False,
    )[0]
    predictions = []
    if result.boxes is not None:
        for box in result.boxes:
            class_id = int(box.cls.item())
            predictions.append({
                "model": model_name,
                "class_id": class_id,
                "class_name": str(result.names[class_id]),
                "confidence": float(box.conf.item()),
                "coordinates": [float(value) for value in box.xyxy[0].tolist()],
            })

    del result, detector
    gc.collect()
    return predictions


def classify_freshness(crop, image_path, pipeline_models):
    crop.save(image_path, format="JPEG", quality=95)
    result = analyze_freshness(
        image_path,
        pipeline_models,
        skip_produce_validation=True,
    )
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


def requires_ripeness_model(items):
    supported_classes = (
        SUPPORTED_RIPENESS_CLASSES
        | EXTENDED_RIPENESS_CLASSES
        | NEW_ONLY_RIPENESS_CLASSES
        | NEW_RIPENESS_CLASSES
    )
    return any(
        item["freshness"]["label"] == "Fresh"
        and any(
            candidate["normalizedName"] in supported_classes
            for candidate in item["candidates"]
        )
        for item in items
    )


def analyze_image(image_path):
    image_path = Path(image_path)
    if not image_path.is_file():
        raise FileNotFoundError(f"Image file does not exist: {image_path}")

    with Image.open(image_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    image.thumbnail((1280, 1280))

    if not CARTOON_CLASSIFIER_PATH.is_file():
        raise FileNotFoundError(
            f"Illustration classifier not found: {CARTOON_CLASSIFIER_PATH}"
        )
    illustration_classifier = YOLO(str(CARTOON_CLASSIFIER_PATH))
    image_validation = check_image_type(image, illustration_classifier)
    del illustration_classifier
    gc.collect()

    if image_validation["rejected"]:
        return {
            "success": True,
            "status": "rejected_illustration",
            "analysisMode": "starter",
            "message": (
                "The image looks like an illustration. Upload a clear photo "
                "of real produce instead."
            ),
            "imageValidation": image_validation,
            "detections": [],
        }

    detector_predictions = []
    for model_name, model_path in (
        ("active", DETECTOR_PATH),
        ("extended", EXTENDED_DETECTOR_PATH),
        ("tropical", TROPICAL_DETECTOR_PATH),
    ):
        detector_predictions.extend(
            collect_detector_predictions(image, model_name, model_path)
        )

    if not TROPICAL_DETECTOR_METRICS_PATH.is_file():
        raise FileNotFoundError(
            f"Detector metrics not found: {TROPICAL_DETECTOR_METRICS_PATH}"
        )
    tropical_metrics = json.loads(
        TROPICAL_DETECTOR_METRICS_PATH.read_text(encoding="utf-8")
    )

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
            "analysisMode": "starter",
            "message": "No fruit or vegetable was detected with sufficient score.",
            "imageValidation": image_validation,
            "detections": [],
        }

    pipeline_models = load_pipeline_models(include_clip=False)
    items = []
    with tempfile.TemporaryDirectory(prefix="produce-classifier-") as temp_dir:
        for index, detected_object in enumerate(detected_objects, start=1):
            coordinates = detected_object["coordinates"]
            crop = crop_with_padding(image, coordinates)
            crop_path = Path(temp_dir) / f"produce-{index}.jpg"
            freshness = classify_freshness(crop, crop_path, pipeline_models)
            candidates = identity_candidates(detected_object["predictions"])
            if candidates:
                items.append({
                    "coordinates": coordinates,
                    "crop": crop,
                    "freshness": freshness,
                    "candidates": candidates,
                })

    del pipeline_models
    gc.collect()

    ripeness_models = (
        load_ripeness_models() if requires_ripeness_model(items) else {}
    )
    detections = []
    for item in items:
        candidate_results = []
        for candidate in item["candidates"]:
            preferred_model = preferred_detector_model(candidate)
            ripeness = classify_ripeness(
                candidate["normalizedName"],
                item["freshness"],
                item["crop"],
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
                "freshness": item["freshness"],
                "ripeness": ripeness,
                "recommendation": recommendation_for(item["freshness"], ripeness),
            })

        primary_candidate = candidate_results[0]
        coordinates = item["coordinates"]
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
        "analysisMode": "starter",
        "message": (
            "Memory-optimized analysis completed with illustration, produce, "
            "freshness, and supported ripeness checks."
        ),
        "imageValidation": image_validation,
        "detections": detections,
        "modelEvaluation": {
            "ripenessTestAccuracy": ripeness_models.get(
                "active_metrics", {}
            ).get("test_accuracy"),
            "ripenessTestMacroF1": ripeness_models.get(
                "active_metrics", {}
            ).get("test_macro_f1"),
            "tropicalDetectorCandidate": {
                "classes": len(tropical_metrics["classes"]),
                "testImages": tropical_metrics["images_per_split"]["test"],
                "testMap50": tropical_metrics["test_metrics"]["metrics/mAP50(B)"],
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
            "message": "Usage: python analyze_produce_starter.py <image_path>",
        }))
        raise SystemExit(2)

    try:
        print(json.dumps(analyze_image(sys.argv[1]), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({
            "success": False,
            "status": "error",
            "message": str(error),
        }, ensure_ascii=False))
        raise SystemExit(1)
