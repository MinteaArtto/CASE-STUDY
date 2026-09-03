import os
import re
import sys
import csv
import subprocess


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PREDICT_SCRIPT = os.path.join(
    BASE_DIR,
    "predict.py"
)

VALIDATION_DIR = os.path.join(
    BASE_DIR,
    "validation_images"
)

OUTPUT_CSV = os.path.join(
    BASE_DIR,
    "threshold_validation_results.csv"
)


# ============================================================
# SETTINGS
# ============================================================

IMAGE_EXTENSIONS = (
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
)

THRESHOLDS = [
    0.70,
    0.75,
    0.80,
    0.85,
    0.90,
    0.95,
]


# ============================================================
# RUN EXISTING predict.py
# ============================================================

def predict_image(image_path):

    result = subprocess.run(
        [
            sys.executable,
            PREDICT_SCRIPT,
            image_path,
        ],
        capture_output=True,
        text=True,
    )

    output = result.stdout
    error = result.stderr

    if result.returncode != 0:
        print()
        print("Prediction failed:")
        print(image_path)
        print(error)

        return None, None

    prediction_match = re.search(
        r"Prediction:\s*(Fresh|Rotten)",
        output,
        re.IGNORECASE,
    )

    confidence_match = re.search(
        r"Confidence:\s*([0-9.]+)",
        output,
        re.IGNORECASE,
    )

    if not prediction_match or not confidence_match:

        print()
        print("Could not read prediction:")
        print(image_path)
        print(output)

        return None, None

    prediction = (
        prediction_match
        .group(1)
        .capitalize()
    )

    confidence = float(
        confidence_match.group(1)
    )

    return prediction, confidence


# ============================================================
# COLLECT RESULTS
# ============================================================

def collect_results():

    results = []

    folders = [
        ("Fresh", "Fresh"),
        ("Rotten", "Rotten"),
        ("NonProduce", "Unsupported"),
    ]

    for folder_name, actual_label in folders:

        folder_path = os.path.join(
            VALIDATION_DIR,
            folder_name,
        )

        if not os.path.exists(folder_path):

            print(
                f"Folder not found: {folder_path}"
            )

            continue

        files = [
            filename
            for filename in os.listdir(folder_path)
            if filename.lower().endswith(
                IMAGE_EXTENSIONS
            )
        ]

        print()
        print("=" * 50)
        print(f"Testing: {folder_name}")
        print(f"Images: {len(files)}")
        print("=" * 50)

        for index, filename in enumerate(
            files,
            start=1,
        ):

            image_path = os.path.join(
                folder_path,
                filename,
            )

            print(
                f"[{index}/{len(files)}] {filename}",
                end=" -> ",
            )

            prediction, confidence = (
                predict_image(image_path)
            )

            if prediction is None:
                print("FAILED")
                continue

            if actual_label == "Unsupported":
                correct = None
            else:
                correct = (
                    prediction == actual_label
                )

            print(
                f"{prediction} "
                f"({confidence * 100:.2f}%)"
            )

            results.append(
                {
                    "filename": filename,
                    "actual": actual_label,
                    "prediction": prediction,
                    "confidence": confidence,
                    "correct": correct,
                }
            )

    return results


# ============================================================
# SAVE RESULTS
# ============================================================

def save_results(results):

    with open(
        OUTPUT_CSV,
        "w",
        newline="",
        encoding="utf-8",
    ) as csvfile:

        fieldnames = [
            "filename",
            "actual",
            "prediction",
            "confidence",
            "correct",
        ]

        writer = csv.DictWriter(
            csvfile,
            fieldnames=fieldnames,
        )

        writer.writeheader()

        writer.writerows(results)

    print()
    print("Results saved to:")
    print(OUTPUT_CSV)


# ============================================================
# SHOW MISCLASSIFICATIONS
# ============================================================

def show_errors(results):

    print()
    print("=" * 70)
    print("MISCLASSIFIED PRODUCE")
    print("=" * 70)

    errors = [
        row
        for row in results
        if (
            row["actual"] in (
                "Fresh",
                "Rotten",
            )
            and row["correct"] is False
        )
    ]

    if not errors:

        print(
            "No Fresh/Rotten images were misclassified."
        )

        return

    for row in errors:

        print(
            f"{row['filename']} | "
            f"Actual: {row['actual']} | "
            f"Predicted: {row['prediction']} | "
            f"Confidence: "
            f"{row['confidence'] * 100:.2f}%"
        )


# ============================================================
# SHOW NON-PRODUCE RESULTS
# ============================================================

def show_nonproduce(results):

    print()
    print("=" * 70)
    print("NON-PRODUCE RESULTS")
    print("=" * 70)

    rows = [
        row
        for row in results
        if row["actual"] == "Unsupported"
    ]

    if not rows:

        print(
            "No NonProduce images tested."
        )

        return

    for row in rows:

        print(
            f"{row['filename']} | "
            f"{row['prediction']} | "
            f"{row['confidence'] * 100:.2f}%"
        )


# ============================================================
# EVALUATE THRESHOLDS
# ============================================================

def evaluate_thresholds(results):

    produce = [
        row
        for row in results
        if row["actual"] in (
            "Fresh",
            "Rotten",
        )
    ]

    nonproduce = [
        row
        for row in results
        if row["actual"] == "Unsupported"
    ]

    if not produce:

        print(
            "No Fresh/Rotten images available."
        )

        return

    print()
    print("=" * 105)
    print(
        "CONFIDENCE THRESHOLD VALIDATION"
    )
    print("=" * 105)

    print(
        f"{'Threshold':<12}"
        f"{'Accepted':<12}"
        f"{'Uncertain':<12}"
        f"{'Coverage':<15}"
        f"{'Accepted Accuracy':<20}"
        f"{'Rotten->Fresh':<17}"
        f"{'NonProduce Accepted':<20}"
    )

    print("-" * 105)

    for threshold in THRESHOLDS:

        accepted = [
            row
            for row in produce
            if row["confidence"] >= threshold
        ]

        uncertain = [
            row
            for row in produce
            if row["confidence"] < threshold
        ]

        if accepted:

            correct_accepted = sum(
                1
                for row in accepted
                if row["correct"] is True
            )

            accepted_accuracy = (
                correct_accepted
                / len(accepted)
            )

        else:
            accepted_accuracy = 0

        coverage = (
            len(accepted)
            / len(produce)
        )

        rotten_as_fresh = sum(
            1
            for row in accepted
            if (
                row["actual"] == "Rotten"
                and
                row["prediction"] == "Fresh"
            )
        )

        nonproduce_accepted = sum(
            1
            for row in nonproduce
            if (
                row["confidence"]
                >= threshold
            )
        )

        print(
            f"{threshold * 100:>6.0f}%     "
            f"{len(accepted):<12}"
            f"{len(uncertain):<12}"
            f"{coverage * 100:<14.2f}%"
            f"{accepted_accuracy * 100:<19.2f}%"
            f"{rotten_as_fresh:<17}"
            f"{nonproduce_accepted:<20}"
        )


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print(
        "Fresh / Rotten Threshold Validation"
    )

    print(
        "==================================="
    )

    results = collect_results()

    if not results:

        print(
            "No validation images found."
        )

        return

    save_results(results)

    show_errors(results)

    show_nonproduce(results)

    evaluate_thresholds(results)


if __name__ == "__main__":
    main()