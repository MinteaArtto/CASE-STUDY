"""Validate dataset values used by the detector, ripeness, and freshness report."""

import json
import math
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DETECTOR_DATA_DIR = BASE_DIR / ".training-cache" / "detector_tropical_20261114"
DETECTOR_METRICS_PATH = (
    BASE_DIR / "model" / "produce_detector_tropical_20261114" / "candidate_metrics.json"
)
RIPENESS_METRICS_PATH = (
    BASE_DIR / "model" / "ripeness_tree_extension" / "ripeness_metrics.json"
)
FRESHNESS_METRICS_PATH = BASE_DIR / "model" / "unseen_tomato_comparison.json"


def add_check(checks, dataset, name, passed, details):
    checks.append(
        {
            "dataset": dataset,
            "check": name,
            "status": "PASS" if passed else "FAIL",
            "details": details,
        }
    )


def is_finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def percentage_in_range(value):
    return is_finite_number(value) and 0 <= value <= 100


def bbox_fits_image(center_x, center_y, width, height):
    rounding_tolerance = 0.000001
    return (
        center_x - width / 2 >= -rounding_tolerance
        and center_x + width / 2 <= 1 + rounding_tolerance
        and center_y - height / 2 >= -rounding_tolerance
        and center_y + height / 2 <= 1 + rounding_tolerance
    )


def validate_confusion_matrix(
    dataset,
    matrix,
    labels,
    expected_total,
    expected_accuracy,
    expected_row_totals=None,
):
    checks = []
    valid_labels = isinstance(labels, list) and all(
        isinstance(label, str) and label for label in labels
    )
    valid_shape = (
        valid_labels
        and isinstance(matrix, list)
        and len(matrix) == len(labels)
        and all(isinstance(row, list) and len(row) == len(labels) for row in matrix)
    )
    valid_cells = valid_shape and all(
        type(value) is int and value >= 0 for row in matrix for value in row
    )
    add_check(
        checks,
        dataset,
        "data type and shape",
        valid_cells,
        "Confusion matrix must be a square matrix of non-negative integer counts matching its labels.",
    )

    valid_accuracy = is_finite_number(expected_accuracy) and 0 <= expected_accuracy <= 1
    accuracy_percent = expected_accuracy * 100 if valid_accuracy else None
    add_check(
        checks,
        dataset,
        "0-100 range",
        valid_accuracy and percentage_in_range(accuracy_percent),
        (
            f"Stored accuracy is {accuracy_percent:.4f}%."
            if valid_accuracy
            else "Stored accuracy must be a finite numeric fraction from 0 to 1."
        ),
    )

    if valid_cells:
        row_totals = [sum(row) for row in matrix]
        total = sum(row_totals)
        add_check(
            checks,
            dataset,
            "confusion-matrix totals",
            type(expected_total) is int and total == expected_total,
            f"Matrix total is {total}; expected {expected_total}.",
        )
        if expected_row_totals is not None:
            add_check(
                checks,
                dataset,
                "class support consistency",
                row_totals == expected_row_totals,
                f"Actual-label row totals are {row_totals}; expected {expected_row_totals}.",
            )
        if total > 0 and valid_accuracy:
            derived_accuracy = sum(matrix[index][index] for index in range(len(matrix))) / total
            add_check(
                checks,
                dataset,
                "accuracy consistency",
                math.isclose(derived_accuracy, expected_accuracy, abs_tol=0.000051),
                (
                    f"Matrix implies {derived_accuracy * 100:.4f}% accuracy; "
                    f"saved value is {accuracy_percent:.4f}%."
                ),
            )
    return checks


def validate_detector():
    dataset = "detector"
    checks = []
    summary_path = DETECTOR_DATA_DIR / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    metrics = json.loads(DETECTOR_METRICS_PATH.read_text(encoding="utf-8"))
    classes = summary.get("classes")
    test_split = summary.get("splits", {}).get("test", {})
    summary_boxes = test_split.get("boxes", {})
    metrics_classes = metrics.get("classes")

    valid_classes = isinstance(classes, list) and bool(classes) and all(
        isinstance(name, str) and name for name in classes
    )
    add_check(
        checks,
        dataset,
        "class data types",
        valid_classes,
        "Detector class names must be a non-empty list of strings.",
    )
    class_mapping_matches = (
        valid_classes
        and isinstance(metrics_classes, dict)
        and metrics_classes == {str(index): name for index, name in enumerate(classes)}
    )
    add_check(
        checks,
        dataset,
        "class mapping consistency",
        class_mapping_matches,
        "Dataset class order must match the saved evaluation class IDs.",
    )

    image_dir = DETECTOR_DATA_DIR / "test" / "images"
    label_dir = DETECTOR_DATA_DIR / "test" / "labels"
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    image_count = sum(
        1 for path in image_dir.glob("*")
        if path.is_file() and path.suffix.lower() in image_extensions
    )
    label_paths = sorted(label_dir.glob("*.txt"))
    expected_images = test_split.get("images")
    metrics_images = metrics.get("images_per_split", {}).get("test")
    add_check(
        checks,
        dataset,
        "test image count consistency",
        type(expected_images) is int
        and type(metrics_images) is int
        and image_count == expected_images == metrics_images
        and len(label_paths) == image_count,
        (
            f"Found {image_count} images and {len(label_paths)} label files; "
            f"dataset summary={expected_images}, evaluation metadata={metrics_images}."
        ),
    )

    class_counts = {name: 0 for name in classes} if valid_classes else {}
    total_boxes = 0
    row_types_valid = True
    coordinates_in_range = True
    box_area_in_range = True
    boxes_within_image = True
    class_ids_valid = valid_classes
    for label_path in label_paths:
        for line in label_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            fields = line.split()
            if len(fields) != 5:
                row_types_valid = False
                continue
            try:
                class_id = int(fields[0])
                center_x, center_y, width, height = (float(value) for value in fields[1:])
            except ValueError:
                row_types_valid = False
                continue
            total_boxes += 1
            if not all(math.isfinite(value) for value in (center_x, center_y, width, height)):
                row_types_valid = False
                continue
            if not valid_classes or not 0 <= class_id < len(classes):
                class_ids_valid = False
            else:
                class_counts[classes[class_id]] += 1
            if not (
                0 <= center_x <= 1
                and 0 <= center_y <= 1
                and 0 < width <= 1
                and 0 < height <= 1
            ):
                coordinates_in_range = False
            area_percent = width * height * 100
            if not percentage_in_range(area_percent) or area_percent == 0:
                box_area_in_range = False
            if not bbox_fits_image(center_x, center_y, width, height):
                boxes_within_image = False

    add_check(
        checks,
        dataset,
        "annotation data types",
        row_types_valid,
        "Each non-empty YOLO annotation row must contain an integer class ID and four finite numeric coordinates.",
    )
    add_check(
        checks,
        dataset,
        "annotation coordinate range",
        coordinates_in_range,
        "Normalized centers and dimensions must be in [0, 1], with positive width and height.",
    )
    add_check(
        checks,
        dataset,
        "bounding-box area 0-100 range",
        box_area_in_range,
        "Each normalized box area, expressed as a percentage of the image, must be in (0, 100].",
    )
    add_check(
        checks,
        dataset,
        "bounding-box boundary consistency",
        boxes_within_image,
        "Each box must fit within the normalized image boundaries.",
    )
    add_check(
        checks,
        dataset,
        "annotation class IDs",
        class_ids_valid,
        "Every annotation class ID must refer to a declared detector class.",
    )

    valid_expected_counts = (
        isinstance(summary_boxes, dict)
        and all(type(value) is int and value >= 0 for value in summary_boxes.values())
        and set(summary_boxes).issubset(set(classes) if valid_classes else set())
    )
    expected_box_count = (
        sum(summary_boxes.values()) if valid_expected_counts else None
    )
    add_check(
        checks,
        dataset,
        "annotation counts consistency",
        valid_expected_counts
        and total_boxes == expected_box_count
        and class_counts == {
            name: summary_boxes.get(name, 0) for name in classes
        },
        f"Found {total_boxes} boxes; saved split summary declares {expected_box_count}.",
    )

    test_metrics = metrics.get("test_metrics", {})
    scores = list(test_metrics.values()) if isinstance(test_metrics, dict) else []
    valid_scores = bool(scores) and all(
        is_finite_number(score) and percentage_in_range(score * 100)
        for score in scores
    )
    add_check(
        checks,
        dataset,
        "evaluation score types and 0-100 range",
        valid_scores,
        "Saved detector metrics must be finite numeric fractions equivalent to percentages from 0 to 100.",
    )
    return checks


def validate_ripeness():
    dataset = "ripeness"
    metrics = json.loads(RIPENESS_METRICS_PATH.read_text(encoding="utf-8"))
    matrix = metrics.get("confusion_matrix")
    labels = metrics.get("labels")
    per_fruit = metrics.get("per_fruit")
    per_fruit_valid = isinstance(per_fruit, dict) and all(
        isinstance(name, str)
        and isinstance(values, dict)
        and type(values.get("n")) is int
        and values["n"] > 0
        and is_finite_number(values.get("accuracy"))
        and percentage_in_range(values["accuracy"] * 100)
        for name, values in per_fruit.items()
    )
    checks = []
    add_check(
        checks,
        dataset,
        "per-fruit summary data types and range",
        per_fruit_valid,
        "Per-fruit sample counts must be positive integers and accuracies must be numeric percentages from 0 to 100.",
    )
    add_check(
        checks,
        dataset,
        "class label consistency",
        labels == ["Unripe", "Ripe", "Overripe"],
        "Saved matrix row and column order must match the ripeness evaluation class order.",
    )
    expected_total = (
        sum(values["n"] for values in per_fruit.values()) if per_fruit_valid else None
    )
    checks.extend(
        validate_confusion_matrix(
            dataset,
            matrix,
            labels,
            expected_total,
            metrics.get("test_accuracy"),
            expected_row_totals=[187, 157, 80],
        )
    )
    return checks


def validate_freshness():
    dataset = "freshness"
    metrics = json.loads(FRESHNESS_METRICS_PATH.read_text(encoding="utf-8"))
    expected_total = metrics.get("held_out_test_images")
    checks = []
    add_check(
        checks,
        dataset,
        "source data limitation",
        True,
        "Validated saved unseen-tomato evaluation totals; raw Fresh/Rotten image folders are unavailable in this checkout.",
    )
    for model_name in ("cnn", "cnn_plus_decision_tree"):
        model = metrics.get(model_name, {})
        checks.extend(
            validate_confusion_matrix(
                f"{dataset} ({model_name})",
                model.get("confusion_matrix"),
                ["Fresh", "Rotten"],
                expected_total,
                model.get("held_out_accuracy"),
                expected_row_totals=[expected_total // 2, expected_total // 2]
                if type(expected_total) is int and expected_total % 2 == 0
                else None,
            )
        )
    return checks


def validate_all():
    return validate_detector() + validate_ripeness() + validate_freshness()


if __name__ == "__main__":
    import sys

    results = validate_all()
    print(json.dumps(results, indent=2))
    raise SystemExit(0 if all(item["status"] == "PASS" for item in results) else 1)
