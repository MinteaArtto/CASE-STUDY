import argparse
import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WEIGHTS = (
    BASE_DIR / "model" / "produce_detector" / "weights" / "best.pt"
)


def main():
    parser = argparse.ArgumentParser(
        description="Detect and name produce in an image using the trained YOLO model."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("--weights", type=Path, default=DEFAULT_WEIGHTS)
    parser.add_argument("--confidence", type=float, default=0.25)
    args = parser.parse_args()

    if not args.image.is_file():
        raise FileNotFoundError(f"Image not found: {args.image}")
    if not args.weights.is_file():
        raise FileNotFoundError(
            f"Trained detector weights not found: {args.weights}. "
            "Train the detector before running inference."
        )
    if not 0 <= args.confidence <= 1:
        raise ValueError("confidence must be between 0 and 1.")

    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise RuntimeError(
            "Ultralytics is required. Install ml/requirements-detection.txt "
            "in the ml virtual environment."
        ) from error

    model = YOLO(str(args.weights))
    result = model.predict(
        source=str(args.image),
        conf=args.confidence,
        verbose=False,
    )[0]
    detections = []

    if result.boxes is not None:
        for box in result.boxes:
            class_id = int(box.cls.item())
            coordinates = box.xyxy[0].tolist()
            detections.append(
                {
                    "classId": class_id,
                    "name": result.names[class_id],
                    "confidence": round(float(box.conf.item()), 4),
                    "box": {
                        "x1": round(coordinates[0], 2),
                        "y1": round(coordinates[1], 2),
                        "x2": round(coordinates[2], 2),
                        "y2": round(coordinates[3], 2),
                    },
                }
            )

    print(
        json.dumps(
            {
                "success": True,
                "status": "detected" if detections else "no_detections",
                "detections": detections,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            json.dumps(
                {
                    "success": False,
                    "status": "error",
                    "message": str(error),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)
