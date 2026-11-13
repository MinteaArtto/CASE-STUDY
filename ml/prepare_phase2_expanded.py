import argparse
import json
import math
import random
import shutil
import zipfile
from collections import Counter, defaultdict
from io import BytesIO
from pathlib import Path, PurePosixPath

import yaml
from PIL import Image

from prepare_phase2_pilot import (
    load_names,
    normalized_box,
    save_crop,
    select_balanced_records,
)


BASE_DIR = Path(__file__).resolve().parent
DETECTION_SOURCE = BASE_DIR / "datasets" / "produce_detection"
DETECTION_PILOT = BASE_DIR / "datasets" / "produce_detection_pilot"
DETECTION_OUTPUT = BASE_DIR / "datasets" / "produce_detection_expanded"
RIPENESS_PILOT = BASE_DIR / "datasets" / "ripeness_pilot"
RIPENESS_OUTPUT = BASE_DIR / "datasets" / "ripeness_expanded"
RIPENESS_ARCHIVE = BASE_DIR / "dataset" / "zips" / "Tropical-Fruit-Ripeness.zip"
FRUIT_VEGETABLE_ARCHIVE = (
    BASE_DIR / "dataset" / "zips" / "Fruit-Vegetable-Ripeness.zip"
)

DETECTOR_MIN_TRAIN_IMAGES_PER_CLASS = 100
DETECTOR_EVAL_IMAGES_PER_CLASS = 40
RIPENESS_MAX_TRAIN_SAMPLES_PER_NEW_CLASS = 100
RIPENESS_EVAL_SAMPLES_PER_NEW_CLASS = 40
FRUITS = ("apple", "banana", "grape", "mango", "melon", "orange", "peach", "pear")
RIPENESS_STAGES = ("unripe", "ripe", "overripe")
RANDOM_SEED = 43


def load_config(path):
    config = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError(f"Invalid dataset configuration: {path}")
    return config


def detector_records(split, source_names):
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
                class_id = int(parts[0])
            except ValueError:
                continue
            if class_id < 0 or class_id >= len(source_names):
                continue
            class_name = source_names[class_id]
            labels.append(f"{class_name} {' '.join(parts[1:])}")
            present_classes.add(class_name)
        if present_classes:
            records.append(
                {
                    "image": image,
                    "key": str(image.relative_to(DETECTION_SOURCE)),
                    "labels": labels,
                    "classes": present_classes,
                }
            )
    return records


def select_supplemental_records(records, counts, classes, minimum, seed):
    rng = random.Random(seed)
    candidates_by_class = {
        name: [record for record in records if name in record["classes"]]
        for name in classes
    }
    for candidates in candidates_by_class.values():
        rng.shuffle(candidates)

    selected = {}
    cursors = Counter()
    while any(counts[name] < minimum for name in classes):
        class_name = max(
            (name for name in classes if counts[name] < minimum),
            key=lambda name: minimum - counts[name],
        )
        candidates = candidates_by_class[class_name]
        while (
            cursors[class_name] < len(candidates)
            and candidates[cursors[class_name]]["key"] in selected
        ):
            cursors[class_name] += 1
        if cursors[class_name] >= len(candidates):
            raise ValueError(
                f"Not enough training images to reach {minimum} examples "
                f"for {class_name}."
            )
        record = candidates[cursors[class_name]]
        cursors[class_name] += 1
        selected[record["key"]] = record
        counts.update(record["classes"])
    return list(selected.values())


def write_detector_split(split, records, class_names):
    image_dir = DETECTION_OUTPUT / split / "images"
    label_dir = DETECTION_OUTPUT / split / "labels"
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    for index, record in enumerate(records):
        image_name = f"{split}_{index:05d}{record['image'].suffix.lower()}"
        shutil.copy2(record["image"], image_dir / image_name)
        output_labels = []
        for label in record["labels"]:
            class_name, coordinates = label.split(maxsplit=1)
            output_labels.append(f"{class_names.index(class_name)} {coordinates}")
        (label_dir / f"{split}_{index:05d}.txt").write_text(
            "\n".join(output_labels),
            encoding="utf-8",
        )
        counts.update(record["classes"])
    return counts


def prepare_detector():
    if not DETECTION_SOURCE.is_dir() or not DETECTION_PILOT.is_dir():
        raise FileNotFoundError("Prepared detector source and pilot are required.")
    if DETECTION_OUTPUT.exists():
        raise FileExistsError(f"Expanded detector output already exists: {DETECTION_OUTPUT}")

    source_names = load_names(load_config(DETECTION_SOURCE / "data.yaml"))
    pilot_names = load_names(load_config(DETECTION_PILOT / "data.yaml"))
    source_records = {
        split: detector_records(split, source_names)
        for split in ("train", "val", "test")
    }
    pilot_classes = set(pilot_names)
    pilot_train, _ = select_balanced_records(
        [
            record for record in source_records["train"]
            if record["classes"] & pilot_classes
        ],
        pilot_names,
        minimum_per_class=225,
        target_total=1800,
        seed=42,
    )
    selected_names = {record["key"] for record in pilot_train}
    train_counts = Counter()
    for record in pilot_train:
        train_counts.update(record["classes"])

    available_records = [
        record
        for split_records in source_records.values()
        for record in split_records
        if record["key"] not in selected_names
    ]
    val_records, _ = select_balanced_records(
        available_records,
        source_names,
        minimum_per_class=DETECTOR_EVAL_IMAGES_PER_CLASS,
        target_total=DETECTOR_EVAL_IMAGES_PER_CLASS * len(source_names),
        seed=RANDOM_SEED + 1,
    )
    val_names = {record["key"] for record in val_records}
    remaining_records = [
        record for record in available_records
        if record["key"] not in val_names
    ]
    test_records, _ = select_balanced_records(
        remaining_records,
        source_names,
        minimum_per_class=DETECTOR_EVAL_IMAGES_PER_CLASS,
        target_total=DETECTOR_EVAL_IMAGES_PER_CLASS * len(source_names),
        seed=RANDOM_SEED + 2,
    )
    test_names = {record["key"] for record in test_records}
    remaining_train = [
        record for record in remaining_records
        if record["key"] not in test_names
    ]
    supplemental = select_supplemental_records(
        remaining_train,
        train_counts,
        source_names,
        DETECTOR_MIN_TRAIN_IMAGES_PER_CLASS,
        RANDOM_SEED,
    )
    train_records = pilot_train + supplemental

    summaries = {
        "train": dict(sorted(write_detector_split(
            "train", train_records, source_names
        ).items()))
    }
    for split, records in (("val", val_records), ("test", test_records)):
        summaries[split] = dict(sorted(write_detector_split(
            split, records, source_names
        ).items()))

    (DETECTION_OUTPUT / "data.yaml").write_text(
        "path: .\n"
        "train: train/images\n"
        "val: val/images\n"
        "test: test/images\n"
        f"nc: {len(source_names)}\n"
        f"names: {json.dumps(source_names)}\n",
        encoding="utf-8",
    )
    (DETECTION_OUTPUT / "summary.json").write_text(
        json.dumps(
            {
                "classes": source_names,
                "images_per_split": {
                    split: len(list((DETECTION_OUTPUT / split / "images").iterdir()))
                    for split in ("train", "val", "test")
                },
                "images_by_class": summaries,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return summaries


def archive_ripeness_candidates(archive):
    config = load_names(yaml.safe_load(archive.read("data.yaml")))
    image_members = {}
    for name in archive.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if len(path.parts) >= 3 and path.parts[1] == "images":
            image_members[(path.parts[0], path.stem)] = name

    candidates = defaultdict(lambda: defaultdict(list))
    seen = defaultdict(lambda: defaultdict(set))
    for name in archive.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() != ".txt" or len(path.parts) < 3:
            continue
        if path.parts[1] != "labels" or path.parts[0] not in {"train", "valid", "test"}:
            continue
        image_member = image_members.get((path.parts[0], path.stem))
        if image_member is None:
            continue
        for line in archive.read(name).decode("utf-8").splitlines():
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
                or class_id >= len(config)
                or not all(math.isfinite(value) for value in coordinates)
            ):
                continue
            name_parts = config[class_id].strip().casefold().split()
            if len(name_parts) != 2:
                continue
            fruit, stage = name_parts
            if fruit not in FRUITS or stage not in RIPENESS_STAGES:
                continue
            class_name = f"{fruit}_{stage}"
            if image_member in seen[class_name][path.parts[0]]:
                continue
            box = normalized_box(coordinates)
            if box is None:
                continue
            candidates[class_name][path.parts[0]].append(
                {"image": image_member, "box": box}
            )
            seen[class_name][path.parts[0]].add(image_member)
    return candidates


def copy_existing_ripeness_pilot(class_name):
    counts = {}
    for split in ("train", "val", "test"):
        source_dir = RIPENESS_PILOT / split / class_name
        target_dir = RIPENESS_OUTPUT / split / class_name
        if not source_dir.is_dir():
            continue
        files = sorted(source_dir.glob("*"))
        if files:
            target_dir.mkdir(parents=True, exist_ok=True)
            for path in files:
                shutil.copy2(path, target_dir / path.name)
            counts[split] = len(files)
    return counts


def choose_candidates(items, limit, seed):
    items = list(items)
    random.Random(seed).shuffle(items)
    return items[:limit]


def prepare_pumpkin(archive, summary):
    by_class = defaultdict(list)
    for name in archive.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if "pumpkin" not in path.stem.casefold():
            continue
        stage = path.parts[0].casefold()
        if stage not in {"ripe", "unripe"}:
            continue
        by_class[f"pumpkin_{stage}"].append(name)

    rng = random.Random(RANDOM_SEED)
    for class_name, members in by_class.items():
        rng.shuffle(members)
        train_end = max(1, int(len(members) * 0.70))
        val_end = train_end + max(1, int(len(members) * 0.15))
        splits = {
            "train": members[:train_end],
            "val": members[train_end:val_end],
            "test": members[val_end:],
        }
        summary[class_name] = {}
        for split, selected in splits.items():
            target_dir = RIPENESS_OUTPUT / split / class_name
            if selected:
                target_dir.mkdir(parents=True, exist_ok=True)
            for index, member in enumerate(selected):
                with Image.open(BytesIO(archive.read(member))) as image:
                    image.convert("RGB").save(
                        target_dir / f"{class_name}_{index:04d}.jpg",
                        format="JPEG",
                        quality=95,
                    )
            summary[class_name][split] = len(selected)


def prepare_ripeness():
    if not RIPENESS_PILOT.is_dir():
        raise FileNotFoundError(f"Ripeness pilot not found: {RIPENESS_PILOT}")
    if not RIPENESS_ARCHIVE.is_file() or not FRUIT_VEGETABLE_ARCHIVE.is_file():
        raise FileNotFoundError("Ripeness source archives are required.")
    if RIPENESS_OUTPUT.exists():
        raise FileExistsError(f"Expanded ripeness output already exists: {RIPENESS_OUTPUT}")

    summary = {}
    with zipfile.ZipFile(RIPENESS_ARCHIVE) as archive:
        candidates = archive_ripeness_candidates(archive)
        for fruit in FRUITS:
            for stage in RIPENESS_STAGES:
                class_name = f"{fruit}_{stage}"
                copied = copy_existing_ripeness_pilot(class_name)
                class_summary = dict(copied)
                for source_split, target_split in (
                    ("train", "train"),
                    ("valid", "val"),
                    ("test", "test"),
                ):
                    if target_split in copied:
                        continue
                    limit = (
                        RIPENESS_MAX_TRAIN_SAMPLES_PER_NEW_CLASS
                        if target_split == "train"
                        else RIPENESS_EVAL_SAMPLES_PER_NEW_CLASS
                    )
                    selected = choose_candidates(
                        candidates[class_name][source_split],
                        limit,
                        RANDOM_SEED + len(class_summary),
                    )
                    target_dir = RIPENESS_OUTPUT / target_split / class_name
                    for index, candidate in enumerate(selected):
                        target = target_dir / f"{class_name}_{index:04d}.jpg"
                        target.parent.mkdir(parents=True, exist_ok=True)
                        if not save_crop(archive, candidate, target):
                            target.unlink(missing_ok=True)
                    written = len(list(target_dir.glob("*.jpg"))) if target_dir.is_dir() else 0
                    if not written:
                        raise ValueError(f"No {target_split} samples for {class_name}.")
                    class_summary[target_split] = written
                summary[class_name] = class_summary

    with zipfile.ZipFile(FRUIT_VEGETABLE_ARCHIVE) as archive:
        for class_name in ("tomato_unripe", "tomato_ripe"):
            summary[class_name] = copy_existing_ripeness_pilot(class_name)
        prepare_pumpkin(archive, summary)

    for split in ("train", "val", "test"):
        split_dir = RIPENESS_OUTPUT / split
        if not split_dir.is_dir():
            raise ValueError(f"Missing ripeness split: {split}")
        missing = [
            name for name, counts in summary.items()
            if counts.get(split, 0) == 0
        ]
        if missing:
            raise ValueError(
                f"Missing {split} samples for: {', '.join(sorted(missing))}"
            )
    (RIPENESS_OUTPUT / "summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Prepare expanded detector and ripeness training datasets."
    )
    parser.add_argument("--only-detector", action="store_true")
    parser.add_argument("--only-ripeness", action="store_true")
    args = parser.parse_args()
    if args.only_detector and args.only_ripeness:
        parser.error("Choose at most one --only-* option.")

    detection_summary = None if args.only_ripeness else prepare_detector()
    ripeness_summary = None if args.only_detector else prepare_ripeness()
    print(
        json.dumps(
            {
                "produce_detection": detection_summary,
                "ripeness": ripeness_summary,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
