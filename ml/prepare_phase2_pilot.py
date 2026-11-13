import json
import math
import random
import shutil
import zipfile
import argparse
from collections import Counter, defaultdict
from io import BytesIO
from pathlib import Path, PurePosixPath

import yaml
from PIL import Image


BASE_DIR = Path(__file__).resolve().parent
DETECTION_SOURCE = BASE_DIR / "datasets" / "produce_detection"
DETECTION_OUTPUT = BASE_DIR / "datasets" / "produce_detection_pilot"
RIPENESS_ARCHIVE = BASE_DIR / "dataset" / "zips" / "Tropical-Fruit-Ripeness.zip"
FRUIT_VEGETABLE_ARCHIVE = (
    BASE_DIR / "dataset" / "zips" / "Fruit-Vegetable-Ripeness.zip"
)
RIPENESS_OUTPUT = BASE_DIR / "datasets" / "ripeness_pilot"

DETECTION_CLASSES = (
    "apple",
    "banana",
    "kamatis",
    "mango",
    "okra",
    "orange",
    "sitaw",
    "talong",
)
DETECTION_TRAIN_IMAGES = 1800
DETECTION_EVAL_IMAGES_PER_CLASS = 40

RIPENESS_FRUITS = ("apple", "banana", "mango")
RIPENESS_STAGES = ("unripe", "ripe", "overripe")
RIPENESS_TRAIN_CROPS_PER_CLASS = 155
RIPENESS_EVAL_CROPS_PER_CLASS = 20
TOMATO_TRAIN_IMAGES_PER_CLASS = 200
TOMATO_EVAL_IMAGES_PER_SPLIT = 40
RANDOM_SEED = 42


def load_names(config):
    names = config.get("names")
    if isinstance(names, dict):
        return [names[index] for index in sorted(names)]
    if isinstance(names, list):
        return names
    raise ValueError("Dataset configuration has no supported class-name list.")


def detector_records(split, source_names):
    source_ids = {
        source_names.index(name): index
        for index, name in enumerate(DETECTION_CLASSES)
    }
    image_dir = DETECTION_SOURCE / split / "images"
    label_dir = DETECTION_SOURCE / split / "labels"
    images_by_stem = {
        image.stem: image
        for image in image_dir.iterdir()
        if image.is_file()
    }
    records = []

    for label_file in sorted(label_dir.glob("*.txt")):
        image = images_by_stem.get(label_file.stem)
        if image is None:
            continue

        labels = []
        present_classes = set()
        for line in label_file.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if not parts:
                continue
            try:
                source_id = int(parts[0])
            except ValueError:
                continue
            if source_id not in source_ids:
                continue

            target_id = source_ids[source_id]
            labels.append(f"{target_id} {' '.join(parts[1:])}")
            present_classes.add(DETECTION_CLASSES[target_id])

        if present_classes:
            records.append(
                {
                    "image": image,
                    "labels": labels,
                    "classes": present_classes,
                }
            )

    return records


def select_balanced_records(records, classes, minimum_per_class, target_total, seed):
    def record_key(record):
        return record.get("key", record["image"].name)

    rng = random.Random(seed)
    candidates_by_class = {
        name: [
            record
            for record in records
            if name in record["classes"]
        ]
        for name in classes
    }
    for candidates in candidates_by_class.values():
        rng.shuffle(candidates)

    counts = Counter()
    selected = {}
    cursors = Counter()

    while any(counts[name] < minimum_per_class for name in classes):
        class_name = max(
            (name for name in classes if counts[name] < minimum_per_class),
            key=lambda name: minimum_per_class - counts[name],
        )
        candidates = candidates_by_class[class_name]
        while (
            cursors[class_name] < len(candidates)
            and record_key(candidates[cursors[class_name]]) in selected
        ):
            cursors[class_name] += 1
        if cursors[class_name] >= len(candidates):
            raise ValueError(
                f"Not enough unique {class_name} images to meet the "
                f"{minimum_per_class}-image target."
            )

        record = candidates[cursors[class_name]]
        cursors[class_name] += 1
        selected[record_key(record)] = record
        counts.update(record["classes"])

    if len(selected) > target_total:
        raise ValueError(
            "The per-class minimum requires more images than the split target."
        )

    remaining = [
        record
        for record in records
        if record_key(record) not in selected
    ]
    rng.shuffle(remaining)
    for record in remaining[: target_total - len(selected)]:
        selected[record_key(record)] = record

    result = list(selected.values())
    if len(result) != target_total:
        raise ValueError(
            f"Found only {len(result)} eligible images; "
            f"{target_total} were requested."
        )

    final_counts = Counter()
    for record in result:
        final_counts.update(record["classes"])
    if any(final_counts[name] < minimum_per_class for name in classes):
        raise ValueError("Balanced sampling did not meet every class minimum.")
    return result, final_counts


def write_detection_pilot():
    if not DETECTION_SOURCE.is_dir():
        raise FileNotFoundError(
            f"Prepared detector dataset not found: {DETECTION_SOURCE}"
        )
    if DETECTION_OUTPUT.exists():
        raise FileExistsError(
            f"Pilot output already exists: {DETECTION_OUTPUT}"
        )

    source_config = yaml.safe_load(
        (DETECTION_SOURCE / "data.yaml").read_text(encoding="utf-8")
    )
    source_names = load_names(source_config)
    missing = [name for name in DETECTION_CLASSES if name not in source_names]
    if missing:
        raise ValueError("Missing selected detector classes: " + ", ".join(missing))

    selections = {}
    for split, minimum, target, seed in (
        ("train", 225, DETECTION_TRAIN_IMAGES, RANDOM_SEED),
        ("val", DETECTION_EVAL_IMAGES_PER_CLASS, 400, RANDOM_SEED + 1),
        ("test", DETECTION_EVAL_IMAGES_PER_CLASS, 400, RANDOM_SEED + 2),
    ):
        records = detector_records(split, source_names)
        selections[split], _ = select_balanced_records(
            records,
            DETECTION_CLASSES,
            minimum,
            target,
            seed,
        )

    output_counts = {}
    for split, records in selections.items():
        image_dir = DETECTION_OUTPUT / split / "images"
        label_dir = DETECTION_OUTPUT / split / "labels"
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)
        class_images = Counter()
        class_boxes = Counter()

        for index, record in enumerate(records):
            suffix = record["image"].suffix.lower()
            image_name = f"{split}_{index:05d}{suffix}"
            shutil.copy2(record["image"], image_dir / image_name)
            (label_dir / f"{split}_{index:05d}.txt").write_text(
                "\n".join(record["labels"]),
                encoding="utf-8",
            )
            class_images.update(record["classes"])
            for label in record["labels"]:
                class_boxes[DETECTION_CLASSES[int(label.split()[0])]] += 1

        output_counts[split] = {
            "images": len(records),
            "images_per_class": dict(sorted(class_images.items())),
            "boxes_per_class": dict(sorted(class_boxes.items())),
        }

    data_yaml = (
        "path: .\n"
        "train: train/images\n"
        "val: val/images\n"
        "test: test/images\n"
        f"nc: {len(DETECTION_CLASSES)}\n"
        f"names: {json.dumps(list(DETECTION_CLASSES))}\n"
    )
    (DETECTION_OUTPUT / "data.yaml").write_text(data_yaml, encoding="utf-8")
    (DETECTION_OUTPUT / "summary.json").write_text(
        json.dumps(output_counts, indent=2),
        encoding="utf-8",
    )
    return output_counts


def ripeness_class_from_name(name):
    parts = name.strip().casefold().split()
    if len(parts) != 2:
        return None
    fruit, stage = parts
    if fruit in RIPENESS_FRUITS and stage in RIPENESS_STAGES:
        return f"{fruit}_{stage}"
    return None


def normalized_box(coordinates):
    if len(coordinates) == 4:
        center_x, center_y, width, height = coordinates
        x1 = center_x - width / 2
        y1 = center_y - height / 2
        x2 = center_x + width / 2
        y2 = center_y + height / 2
    elif len(coordinates) >= 6 and len(coordinates) % 2 == 0:
        x_values = coordinates[::2]
        y_values = coordinates[1::2]
        x1, x2 = min(x_values), max(x_values)
        y1, y2 = min(y_values), max(y_values)
    else:
        return None

    x1 = max(0.0, min(1.0, x1))
    y1 = max(0.0, min(1.0, y1))
    x2 = max(0.0, min(1.0, x2))
    y2 = max(0.0, min(1.0, y2))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def ripeness_candidates(archive):
    config = yaml.safe_load(archive.read("data.yaml"))
    source_names = load_names(config)
    image_members = {}
    for name in archive.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if len(path.parts) >= 3 and path.parts[1] == "images":
            image_members[(path.parts[0], path.stem)] = name

    candidates = defaultdict(lambda: defaultdict(list))
    seen_per_class_and_image = defaultdict(lambda: defaultdict(set))
    for name in archive.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() != ".txt" or len(path.parts) < 3:
            continue
        if path.parts[1] != "labels":
            continue
        split = path.parts[0]
        if split not in {"train", "valid", "test"}:
            continue
        image_member = image_members.get((split, path.stem))
        if image_member is None:
            continue

        for annotation_index, line in enumerate(
            archive.read(name).decode("utf-8").splitlines()
        ):
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                class_id = int(parts[0])
                coordinates = list(map(float, parts[1:]))
            except ValueError:
                continue
            if (
                class_id < 0
                or class_id >= len(source_names)
                or not all(math.isfinite(value) for value in coordinates)
            ):
                continue
            class_name = ripeness_class_from_name(source_names[class_id])
            if class_name is None:
                continue
            if image_member in seen_per_class_and_image[class_name][split]:
                continue
            box = normalized_box(coordinates)
            if box is None:
                continue

            candidates[class_name][split].append(
                {
                    "image": image_member,
                    "box": box,
                    "annotation_index": annotation_index,
                }
            )
            seen_per_class_and_image[class_name][split].add(image_member)
    return candidates


def save_crop(archive, candidate, destination):
    with Image.open(BytesIO(archive.read(candidate["image"]))) as source:
        image = source.convert("RGB")
    image_width, image_height = image.size
    x1, y1, x2, y2 = candidate["box"]
    left = int(x1 * image_width)
    top = int(y1 * image_height)
    right = int(x2 * image_width)
    bottom = int(y2 * image_height)
    pad_x = max(2, int((right - left) * 0.05))
    pad_y = max(2, int((bottom - top) * 0.05))
    left = max(0, left - pad_x)
    top = max(0, top - pad_y)
    right = min(image_width, right + pad_x)
    bottom = min(image_height, bottom + pad_y)
    if right <= left or bottom <= top:
        return False
    image.crop((left, top, right, bottom)).save(
        destination,
        format="JPEG",
        quality=95,
    )
    return True


def tomato_image_splits(archive):
    images_by_class = defaultdict(list)
    for name in archive.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if "tomato" not in path.stem.casefold():
            continue
        if not path.parts:
            continue
        condition = path.parts[0].casefold()
        if condition == "unripe":
            class_name = "tomato_unripe"
        elif condition == "ripe":
            class_name = "tomato_ripe"
        else:
            continue
        images_by_class[class_name].append(name)

    rng = random.Random(RANDOM_SEED)
    splits = {}
    for class_name, image_names in images_by_class.items():
        rng.shuffle(image_names)
        train_end = int(len(image_names) * 0.70)
        val_end = train_end + int(len(image_names) * 0.15)
        splits[class_name] = {
            "train": image_names[:train_end],
            "val": image_names[train_end:val_end],
            "test": image_names[val_end:],
        }
    return splits


def save_full_image(archive, image_member, destination):
    with Image.open(BytesIO(archive.read(image_member))) as source:
        source.convert("RGB").save(destination, format="JPEG", quality=95)


def write_ripeness_pilot():
    if not RIPENESS_ARCHIVE.is_file():
        raise FileNotFoundError(f"Ripeness archive not found: {RIPENESS_ARCHIVE}")
    if not FRUIT_VEGETABLE_ARCHIVE.is_file():
        raise FileNotFoundError(
            f"Fruit/vegetable ripeness archive not found: "
            f"{FRUIT_VEGETABLE_ARCHIVE}"
        )
    if RIPENESS_OUTPUT.exists():
        raise FileExistsError(
            f"Pilot output already exists: {RIPENESS_OUTPUT}"
        )

    fruit_classes = [
        f"{fruit}_{stage}"
        for fruit in RIPENESS_FRUITS
        for stage in RIPENESS_STAGES
    ]
    summary = {}
    rng = random.Random(RANDOM_SEED)

    with zipfile.ZipFile(RIPENESS_ARCHIVE) as archive:
        candidates = ripeness_candidates(archive)
        for class_name in fruit_classes:
            train_candidates = candidates[class_name]["train"]
            val_candidates = candidates[class_name]["valid"]
            test_candidates = candidates[class_name]["test"]
            rng.shuffle(train_candidates)
            rng.shuffle(val_candidates)
            rng.shuffle(test_candidates)

            if len(train_candidates) < RIPENESS_TRAIN_CROPS_PER_CLASS:
                raise ValueError(
                    f"{class_name} has only {len(train_candidates)} "
                    "training crops."
                )
            if not val_candidates or not test_candidates:
                raise ValueError(
                    f"{class_name} needs both validation and test crops."
                )

            selections = {
                "train": train_candidates[:RIPENESS_TRAIN_CROPS_PER_CLASS],
                "val": val_candidates[
                    :RIPENESS_EVAL_CROPS_PER_CLASS
                ],
                "test": test_candidates[
                    :RIPENESS_EVAL_CROPS_PER_CLASS
                ],
            }
            summary[class_name] = {}

            for split, split_candidates in selections.items():
                class_dir = RIPENESS_OUTPUT / split / class_name
                class_dir.mkdir(parents=True, exist_ok=True)
                written = 0
                for index, candidate in enumerate(split_candidates):
                    target = class_dir / f"{class_name}_{index:04d}.jpg"
                    if save_crop(archive, candidate, target):
                        written += 1
                    else:
                        target.unlink(missing_ok=True)
                if split == "train" and written != RIPENESS_TRAIN_CROPS_PER_CLASS:
                    raise ValueError(
                        f"Only {written} valid training crops were created "
                        f"for {class_name}."
                    )
                if written == 0:
                    raise ValueError(f"No valid {split} crops for {class_name}.")
                summary[class_name][split] = written

    with zipfile.ZipFile(FRUIT_VEGETABLE_ARCHIVE) as archive:
        tomato_splits = tomato_image_splits(archive)
        for class_name in ("tomato_unripe", "tomato_ripe"):
            class_splits = tomato_splits.get(class_name, {})
            train_images = class_splits.get("train", [])
            if len(train_images) < TOMATO_TRAIN_IMAGES_PER_CLASS:
                raise ValueError(
                    f"{class_name} has only {len(train_images)} training "
                    "images after splitting."
                )
            summary[class_name] = {}
            for split, image_names in class_splits.items():
                if split == "train":
                    selected = image_names[:TOMATO_TRAIN_IMAGES_PER_CLASS]
                else:
                    selected = image_names[:TOMATO_EVAL_IMAGES_PER_SPLIT]
                class_dir = RIPENESS_OUTPUT / split / class_name
                class_dir.mkdir(parents=True, exist_ok=True)
                for index, image_member in enumerate(selected):
                    save_full_image(
                        archive,
                        image_member,
                        class_dir / f"{class_name}_{index:04d}.jpg",
                    )
                if not selected:
                    raise ValueError(f"No {split} images for {class_name}.")
                summary[class_name][split] = len(selected)

    (RIPENESS_OUTPUT / "summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Prepare balanced Phase 2 pilot datasets."
    )
    parser.add_argument(
        "--only-ripeness",
        action="store_true",
        help="Prepare ripeness data without rebuilding the detector dataset.",
    )
    args = parser.parse_args()

    detection_summary = (
        None if args.only_ripeness else write_detection_pilot()
    )
    ripeness_summary = write_ripeness_pilot()
    print(
        json.dumps(
            {
                "produce_detection": detection_summary,
                "ripeness_crops": ripeness_summary,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
