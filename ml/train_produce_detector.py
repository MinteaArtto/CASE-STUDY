import argparse
import tempfile
from pathlib import Path

import torch
import yaml


BASE_DIR = Path(__file__).resolve().parent
DATASET_YAML = BASE_DIR / "datasets" / "produce_detection" / "data.yaml"
OUTPUT_DIR = BASE_DIR / "model"


def main():
    parser = argparse.ArgumentParser(
        description="Train a YOLO produce detector from the prepared COCO datasets."
    )
    parser.add_argument("--data", type=Path, default=DATASET_YAML)
    parser.add_argument("--weights", default="yolo11n.pt")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--name", default="produce_detector")
    args = parser.parse_args()

    if not args.data.is_file():
        raise FileNotFoundError(
            f"Prepared dataset not found: {args.data}. "
            "Run prepare_produce_detection_dataset.py first."
        )
    if args.epochs < 1 or args.imgsz < 1 or args.batch < 1:
        raise ValueError("epochs, imgsz, and batch must be positive.")

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

    dataset_config = yaml.safe_load(args.data.read_text(encoding="utf-8"))
    if not isinstance(dataset_config, dict):
        raise ValueError(f"Invalid dataset configuration: {args.data}")
    dataset_config["path"] = str(args.data.resolve().parent)

    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".yaml",
        encoding="utf-8",
        delete=False,
    ) as temporary_config:
        yaml.safe_dump(dataset_config, temporary_config, sort_keys=False)
        resolved_data_path = Path(temporary_config.name)

    try:
        model = YOLO(args.weights)
        model.train(
            data=str(resolved_data_path),
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            device=device,
            workers=args.workers,
            project=str(OUTPUT_DIR.resolve()),
            name=args.name,
            exist_ok=True,
        )
    finally:
        resolved_data_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
