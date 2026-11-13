import argparse
from pathlib import Path

import torch


BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "datasets" / "ripeness_pilot"
OUTPUT_DIR = BASE_DIR / "model"


def main():
    parser = argparse.ArgumentParser(
        description="Train a fruit ripeness classifier on labeled produce crops."
    )
    parser.add_argument("--data", type=Path, default=DATASET_DIR)
    parser.add_argument("--weights", default="yolo11n-cls.pt")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--name", default="ripeness_classifier_pilot")
    args = parser.parse_args()

    if not args.data.is_dir():
        raise FileNotFoundError(f"Ripeness dataset not found: {args.data}")
    if args.epochs < 1 or args.imgsz < 1 or args.batch < 1:
        raise ValueError("epochs, imgsz, and batch must be positive.")
    for split in ("train", "val", "test"):
        if not (args.data / split).is_dir():
            raise FileNotFoundError(
                f"Missing {split} split in ripeness dataset: {args.data}"
            )

    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise RuntimeError(
            "Ultralytics is required. Install ml/requirements-detection.txt "
            "in the ml virtual environment."
        ) from error

    device = args.device
    if device == "auto":
        device = "0" if torch.cuda.is_available() else "cpu"

    model = YOLO(args.weights)
    model.train(
        data=str(args.data.resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        workers=args.workers,
        project=str(OUTPUT_DIR.resolve()),
        name=args.name,
        exist_ok=True,
    )


if __name__ == "__main__":
    main()
