import argparse
import json
import math
import random
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

import yaml


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE = BASE_DIR / "training datasets" / "for detector"
DEFAULT_OUTPUT = BASE_DIR / ".training-cache" / "detector_full"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SPLIT_NAMES = {
    "train": "train",
    "valid": "val",
    "val": "val",
    "test": "test",
}

ALIASES = {
    "ampalaya": "bitter_gourd",
    "bitter_melon": "bitter_gourd",
    "brinjal": "eggplant",
    "calabash": "bottle_gourd",
    "chayote": "chayote",
    "chili": "chili_pepper",
    "green_chili": "chili_pepper",
    "kamatis": "tomato",
    "kangkong": "water_spinach",
    "lady_finger": "okra",
    "oren": "orange",
    "repolyo": "cabbage",
    "sayote": "chayote",
    "sitaw": "yardlong_bean",
    "talong": "eggplant",
    "upo": "bottle_gourd",
}
EXCLUDED_CLASSES = {"egg", "juice", "pickle", "wine"}
STAGE_SUFFIXES = (
    "_overripe",
    "_underripe",
    "_semi_ripe",
    "_semiripe",
    "_medium_ripe",
    "_half_ripe",
    "_unripe",
    "_ripe",
)


def canonical_class_name(value):
    name = re.sub(r"[^a-z0-9]+", "_", str(value).strip().casefold()).strip("_")
    if not name or name in EXCLUDED_CLASSES or name.startswith("defects_"):
        return None

    if name.startswith(("ripe_", "immature_")):
        name = name.split("_", 1)[1]
    if name.startswith("rambutan_"):
        return "rambutan"
    if name == "banana_blossom":
        return name

    changed = True
    while changed:
        changed = False
        for suffix in STAGE_SUFFIXES:
            if name.endswith(suffix):
                name = name[: -len(suffix)].rstrip("_")
                changed = True
                break

    if name in ALIASES:
        return ALIASES[name]

    for prefix in ("banana_", "mango_", "papaya_", "pineapple_"):
        if name.startswith(prefix):
            name = prefix[:-1]
            break

    return ALIASES.get(name, name) if name else None


def load_class_names(config, archive_path):
    names = config.get("names")
    if isinstance(names, dict):
        try:
            names = [names[key] for key in sorted(names, key=lambda item: int(item))]
        except (TypeError, ValueError) as error:
            raise ValueError(f"Invalid class names in {archive_path}") from error
    if not isinstance(names, list) or not names:
        raise ValueError(f"Dataset has no supported class names: {archive_path}")
    return [str(name) for name in names]


def image_and_label_paths(archive, split):
    images = {}
    labels = {}
    for member in archive.namelist():
        path = PurePosixPath(member)
        parts = path.parts
        for index in range(len(parts) - 1):
            if parts[index] not in SPLIT_NAMES or SPLIT_NAMES[parts[index]] != split:
                continue
            kind = parts[index + 1]
            if kind not in {"images", "labels"}:
                continue
            if kind == "images" and path.suffix.lower() in IMAGE_EXTENSIONS:
                images[(parts[index], path.stem)] = member
            elif kind == "labels" and path.suffix.lower() == ".txt":
                labels[(parts[index], path.stem)] = member
            break
    return images, labels


def parse_yolo_label(text, class_names, archive_path, label_path):
    mapped = []
    for line_number, line in enumerate(text.splitlines(), start=1):
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

        if len(coordinates) == 4:
            center_x, center_y, width, height = coordinates
            left = center_x - width / 2
            top = center_y - height / 2
            right = center_x + width / 2
            bottom = center_y + height / 2
        elif len(coordinates) >= 6 and len(coordinates) % 2 == 0:
            x_values = coordinates[::2]
            y_values = coordinates[1::2]
            if any(value < 0 or value > 1 for value in coordinates):
                continue
            left, right = min(x_values), max(x_values)
            top, bottom = min(y_values), max(y_values)
        else:
            continue

        left = max(0.0, min(1.0, left))
        top = max(0.0, min(1.0, top))
        right = max(0.0, min(1.0, right))
        bottom = max(0.0, min(1.0, bottom))
        width = right - left
        height = bottom - top
        if width <= 0 or height <= 0:
            continue

        canonical = canonical_class_name(class_names[class_id])
        if canonical:
            mapped.append(
                (
                    canonical,
                    (left + right) / 2,
                    (top + bottom) / 2,
                    width,
                    height,
                )
            )
    return mapped


def read_records(source_dir):
    zip_paths = sorted(source_dir.glob("*.zip"))
    if not zip_paths:
        raise FileNotFoundError(f"No ZIP datasets found in {source_dir}")

    records = []
    all_classes = set()
    for archive_path in zip_paths:
        with zipfile.ZipFile(archive_path) as archive:
            yaml_path = next(
                (
                    name
                    for name in archive.namelist()
                    if PurePosixPath(name).name.casefold() == "data.yaml"
                ),
                None,
            )
            if not yaml_path:
                print(f"Skipping non-YOLO dataset without data.yaml: {archive_path.name}")
                continue
            config = yaml.safe_load(archive.read(yaml_path))
            if not isinstance(config, dict):
                raise ValueError(f"Invalid dataset configuration: {archive_path}")
            class_names = load_class_names(config, archive_path)
            dataset_key = re.sub(r"[^a-z0-9]+", "_", archive_path.stem.casefold()).strip("_")

            for output_split in ("train", "val", "test"):
                image_paths, label_paths = image_and_label_paths(archive, output_split)
                for (source_split, stem), image_path in sorted(image_paths.items()):
                    label_path = label_paths.get((source_split, stem))
                    if not label_path:
                        continue
                    labels = parse_yolo_label(
                        archive.read(label_path).decode("utf-8", "replace"),
                        class_names,
                        archive_path,
                        label_path,
                    )
                    if not labels:
                        continue
                    all_classes.update(label[0] for label in labels)
                    records.append(
                        {
                            "archive": archive_path,
                            "key": dataset_key,
                            "split": output_split,
                            "image": image_path,
                            "suffix": PurePosixPath(image_path).suffix.lower(),
                            "labels": labels,
                        }
                    )
                print(
                    f"{archive_path.name}: {output_split} "
                    f"{sum(1 for record in records if record['archive'] == archive_path and record['split'] == output_split)} "
                    "annotated images"
                )

    if not records or not all_classes:
        raise ValueError("No valid, mapped YOLO detection annotations were found.")

    train_classes = {
        label[0]
        for record in records
        if record["split"] == "train"
        for label in record["labels"]
    }
    if not train_classes:
        raise ValueError("No mapped detector classes have training annotations.")

    excluded = sorted(all_classes - train_classes)
    if excluded:
        print(
            "Excluding classes with no training examples: "
            + ", ".join(excluded)
        )

    filtered_records = []
    for record in records:
        record["labels"] = [
            label for label in record["labels"] if label[0] in train_classes
        ]
        if record["labels"]:
            filtered_records.append(record)

    return zip_paths, filtered_records, sorted(train_classes)


def sample_records_by_class(records, classes, max_images_per_class, seed):
    if max_images_per_class is None:
        return records
    if max_images_per_class < 1:
        raise ValueError("The per-class image limit must be positive.")

    candidates_by_class = defaultdict(list)
    for record in records:
        for class_name in {label[0] for label in record["labels"]}:
            candidates_by_class[class_name].append(record)

    rng = random.Random(seed)
    for class_name in classes:
        rng.shuffle(candidates_by_class[class_name])

    targets = {
        class_name: min(
            max_images_per_class,
            len(candidates_by_class[class_name]),
        )
        for class_name in classes
    }
    counts = Counter()
    cursors = Counter()
    selected = {}
    while True:
        pending = [
            class_name
            for class_name in classes
            if counts[class_name] < targets[class_name]
        ]
        if not pending:
            break
        class_name = max(
            pending,
            key=lambda name: targets[name] - counts[name],
        )
        candidates = candidates_by_class[class_name]
        while (
            cursors[class_name] < len(candidates)
            and (
                str(candidates[cursors[class_name]]["archive"]),
                candidates[cursors[class_name]]["image"],
            ) in selected
        ):
            cursors[class_name] += 1
        if cursors[class_name] >= len(candidates):
            targets[class_name] = counts[class_name]
            continue

        record = candidates[cursors[class_name]]
        cursors[class_name] += 1
        key = (str(record["archive"]), record["image"])
        selected[key] = record
        counts.update({label[0] for label in record["labels"]})

    return list(selected.values())


def write_dataset(output_dir, zip_paths, records, classes, sample_limits=None):
    if output_dir.exists():
        raise FileExistsError(
            f"Prepared dataset already exists: {output_dir}. "
            "Choose a new output directory or move the existing one aside."
        )

    class_ids = {name: index for index, name in enumerate(classes)}
    for split in ("train", "val", "test"):
        (output_dir / split / "images").mkdir(parents=True, exist_ok=True)
        (output_dir / split / "labels").mkdir(parents=True, exist_ok=True)

    counts = {
        split: {"images": 0, "boxes": Counter()}
        for split in ("train", "val", "test")
    }
    image_index = defaultdict(int)
    records_by_archive = defaultdict(list)
    for record in records:
        records_by_archive[record["archive"]].append(record)

    for archive_path in zip_paths:
        selected = records_by_archive.get(archive_path, [])
        if not selected:
            continue
        with zipfile.ZipFile(archive_path) as archive:
            for record in selected:
                split = record["split"]
                index = image_index[(record["key"], split)]
                image_index[(record["key"], split)] += 1
                image_name = f"{record['key']}_{split}_{index:06d}{record['suffix']}"
                image_target = output_dir / split / "images" / image_name
                label_target = output_dir / split / "labels" / f"{Path(image_name).stem}.txt"
                with archive.open(record["image"]) as source, image_target.open("wb") as target:
                    shutil.copyfileobj(source, target)

                lines = []
                for name, center_x, center_y, width, height in record["labels"]:
                    lines.append(
                        f"{class_ids[name]} {center_x:.6f} {center_y:.6f} "
                        f"{width:.6f} {height:.6f}"
                    )
                    counts[split]["boxes"][name] += 1
                label_target.write_text("\n".join(lines), encoding="utf-8")
                counts[split]["images"] += 1

    (output_dir / "data.yaml").write_text(
        yaml.safe_dump(
            {
                "path": ".",
                "train": "train/images",
                "val": "val/images",
                "test": "test/images",
                "nc": len(classes),
                "names": classes,
            },
            sort_keys=False,
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    summary = {
        "classes": classes,
        "splits": {
            split: {
                "images": value["images"],
                "boxes": dict(sorted(value["boxes"].items())),
            }
            for split, value in counts.items()
        },
        "source_archives": [archive.name for archive in zip_paths],
    }
    if sample_limits:
        summary["sampling_limits_per_class"] = sample_limits
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Merge local YOLO ZIP datasets into one canonical produce dataset."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-train-images-per-class", type=int)
    parser.add_argument("--max-val-images-per-class", type=int)
    parser.add_argument("--max-test-images-per-class", type=int)
    parser.add_argument("--seed", type=int, default=43)
    args = parser.parse_args()

    zip_paths, records, classes = read_records(args.source)
    limits = {
        "train": args.max_train_images_per_class,
        "val": args.max_val_images_per_class,
        "test": args.max_test_images_per_class,
    }
    selected = []
    for offset, split in enumerate(("train", "val", "test")):
        split_records = [record for record in records if record["split"] == split]
        selected.extend(
            sample_records_by_class(
                split_records,
                classes,
                limits[split],
                args.seed + offset,
            )
        )
    summary = write_dataset(
        args.output,
        zip_paths,
        selected,
        classes,
        sample_limits=limits,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
