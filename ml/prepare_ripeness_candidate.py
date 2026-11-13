import argparse
import csv
import json
import math
import random
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

import yaml
from PIL import Image

from prepare_phase2_pilot import load_names, normalized_box, save_crop


BASE_DIR = Path(__file__).resolve().parent
BASE_DATASET = BASE_DIR / ".training-cache" / "ripeness_classifier_300_per_stage"
SOURCE_DIR = BASE_DIR / "training datasets" / "for ripeness"
DEFAULT_OUTPUT = BASE_DIR / ".training-cache" / "ripeness_new_fruits_20261114"
SOURCE_FRUITS = {
    "Avocado.v4-dataset_avocado4.yolov8.zip": "avocado",
    "Dragon Fruit.v4i.yolov8.zip": "dragon_fruit",
    "tomato.v11i.yolov8.zip": "tomato",
}
STAGE_NAMES = {
    "overripe": "Overripe",
    "ripe": "Ripe",
    "underripe": "Unripe",
    "unripe": "Unripe",
    "semi-ripe": "Semi-ripe",
    "turning": "Turning",
}
SPLIT_NAMES = {"train": "train", "valid": "val", "val": "val", "test": "test"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
RANDOM_SEED = 43


def archive_candidates(archive, fruit):
    yaml_member = next(
        (
            name
            for name in archive.namelist()
            if PurePosixPath(name).name.casefold() == "data.yaml"
        ),
        None,
    )
    if not yaml_member:
        raise ValueError(f"No data.yaml in {archive.filename}")
    class_names = load_names(yaml.safe_load(archive.read(yaml_member)))

    images = {}
    for member in archive.namelist():
        path = PurePosixPath(member)
        if (
            path.suffix.casefold() in IMAGE_EXTENSIONS
            and len(path.parts) >= 3
            and path.parts[1] == "images"
        ):
            images[(path.parts[0].casefold(), path.stem)] = member

    candidates = defaultdict(lambda: defaultdict(list))
    seen = defaultdict(lambda: defaultdict(set))
    for member in archive.namelist():
        path = PurePosixPath(member)
        if (
            path.suffix.casefold() != ".txt"
            or len(path.parts) < 3
            or path.parts[1] != "labels"
        ):
            continue
        source_split = path.parts[0].casefold()
        if source_split not in SPLIT_NAMES:
            continue
        image = images.get((source_split, path.stem))
        if image is None:
            continue
        for line in archive.read(member).decode("utf-8", "replace").splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                class_id = int(parts[0])
                coordinates = [float(value) for value in parts[1:]]
            except ValueError:
                continue
            if (
                class_id < 0
                or class_id >= len(class_names)
                or not all(math.isfinite(value) for value in coordinates)
            ):
                continue
            stage = STAGE_NAMES.get(class_names[class_id].strip().casefold())
            box = normalized_box(coordinates)
            if stage is None or box is None or image in seen[stage][source_split]:
                continue
            candidates[stage][source_split].append(
                {
                    "image": image,
                    "box": box,
                    "fruit": fruit,
                    "source_class": class_names[class_id],
                    "source_split": source_split,
                }
            )
            seen[stage][source_split].add(image)
    return candidates


def count_images(root):
    counts = {}
    for split in ("train", "val", "test"):
        counts[split] = {
            class_dir.name: sum(
                path.suffix.casefold() in IMAGE_EXTENSIONS
                for path in class_dir.iterdir()
                if path.is_file()
            )
            for class_dir in sorted((root / split).iterdir())
            if class_dir.is_dir()
        }
    return counts


def prepare_dataset(output, max_train, max_eval, seed):
    if not BASE_DATASET.is_dir():
        raise FileNotFoundError(f"Base ripeness dataset not found: {BASE_DATASET}")
    if output.exists():
        raise FileExistsError(f"Ripeness candidate already exists: {output}")

    for filename in SOURCE_FRUITS:
        source = SOURCE_DIR / filename
        if not source.is_file():
            raise FileNotFoundError(f"Ripeness source archive not found: {source}")

    shutil.copytree(
        BASE_DATASET,
        output,
        ignore=shutil.ignore_patterns("*.cache"),
    )
    manifest_path = output / "new_fruit_manifest.csv"
    source_summary = {}
    with manifest_path.open("w", newline="", encoding="utf-8") as manifest_file:
        writer = csv.DictWriter(
            manifest_file,
            fieldnames=(
                "crop_path",
                "split",
                "fruit",
                "stage",
                "source_archive",
                "source_class",
                "source_image",
            ),
        )
        writer.writeheader()
        for source_index, (filename, fruit) in enumerate(SOURCE_FRUITS.items()):
            source = SOURCE_DIR / filename
            per_source = defaultdict(Counter)
            with zipfile.ZipFile(source) as archive:
                candidates = archive_candidates(archive, fruit)
                for stage in sorted(candidates):
                    for source_split, target_split in SPLIT_NAMES.items():
                        if source_split not in candidates[stage]:
                            continue
                        limit = max_train if target_split == "train" else max_eval
                        selected = list(candidates[stage][source_split])
                        random.Random(
                            seed + source_index * 100 + len(per_source)
                        ).shuffle(selected)
                        selected = selected[:limit]
                        for index, candidate in enumerate(selected):
                            safe_source = re.sub(
                                r"[^a-z0-9]+", "_", Path(filename).stem.casefold()
                            ).strip("_")
                            target = (
                                output
                                / target_split
                                / stage
                                / f"{fruit}_{safe_source}_{source_split}_{index:04d}.jpg"
                            )
                            target.parent.mkdir(parents=True, exist_ok=True)
                            if not save_crop(archive, candidate, target):
                                target.unlink(missing_ok=True)
                                continue
                            with Image.open(target) as crop:
                                if min(crop.size) < 32:
                                    target.unlink()
                                    continue
                            per_source[target_split][stage] += 1
                            writer.writerow(
                                {
                                    "crop_path": str(target.resolve()),
                                    "split": target_split,
                                    "fruit": fruit,
                                    "stage": stage,
                                    "source_archive": filename,
                                    "source_class": candidate["source_class"],
                                    "source_image": candidate["image"],
                                }
                            )
            source_summary[filename] = {
                split: dict(sorted(counts.items()))
                for split, counts in sorted(per_source.items())
            }

    base_counts = count_images(BASE_DATASET)
    candidate_counts = count_images(output)
    summary = {
        "base_dataset": str(BASE_DATASET),
        "base_images_by_split_and_stage": base_counts,
        "new_source_images_by_split_and_stage": source_summary,
        "candidate_images_by_split_and_stage": candidate_counts,
        "training_cap_per_fruit_stage": max_train,
        "validation_and_test_cap_per_fruit_stage": max_eval,
        "source_stage_mapping": {
            "Overripe": ["Overripe"],
            "Ripe": ["Ripe"],
            "Unripe": ["Underripe", "UnRipe", "Unripe"],
            "Semi-ripe": ["semi-ripe"],
            "Turning": ["turning"],
        },
        "test_classes_without_samples": [
            stage
            for stage in candidate_counts["train"]
            if candidate_counts["test"].get(stage, 0) == 0
        ],
    }
    (output / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Add stage-labeled avocado, dragon fruit, and tomato crops."
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-train-per-fruit-stage", type=int, default=100)
    parser.add_argument("--max-eval-per-fruit-stage", type=int, default=20)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    args = parser.parse_args()
    if args.max_train_per_fruit_stage < 1 or args.max_eval_per_fruit_stage < 1:
        parser.error("Training and evaluation sample caps must be positive.")
    summary = prepare_dataset(
        args.output,
        args.max_train_per_fruit_stage,
        args.max_eval_per_fruit_stage,
        args.seed,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
