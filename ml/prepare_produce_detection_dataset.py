import json
import math
import shutil
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

import yaml


BASE_DIR = Path(__file__).resolve().parent
ZIP_DIR = BASE_DIR / "dataset" / "zips"
OUTPUT_DIR = BASE_DIR / "datasets" / "produce_detection"
SPLITS = {
    "train": "train",
    "valid": "val",
    "test": "test",
}
SOURCES = (
    {
        "key": "kubo",
        "archive": "KuboDataset.v2-kubodataset-v2.0.coco.zip",
        "format": "coco",
        "url": "https://universe.roboflow.com/object-detection/kubodataset",
        "license": "CC BY 4.0",
    },
    {
        "key": "fruit",
        "archive": "Tropical-Fruit-Ripeness.zip",
        "format": "yolo",
        "url": "https://universe.roboflow.com/fruitectives-team/fruit-ripeness-unjex",
        "license": "CC BY 4.0",
    },
)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def normalize_class_name(name):
    return "_".join(name.strip().casefold().replace("-", " ").split())


def species_from_ripeness_label(name):
    return normalize_class_name(name).split("_")[0]


def coco_records(archive, source):
    records_by_split = defaultdict(list)
    class_names = set()
    warnings = 0

    for source_split, output_split in SPLITS.items():
        annotation_path = f"{source_split}/_annotations.coco.json"
        try:
            data = json.loads(archive.read(annotation_path))
        except KeyError:
            if source_split == "train":
                raise ValueError(
                    f"Missing required COCO annotations: "
                    f"{source['archive']}::{annotation_path}"
                )
            continue

        parent = PurePosixPath(annotation_path).parent
        categories = {
            item["id"]: normalize_class_name(item["name"])
            for item in data.get("categories", [])
        }
        annotations_by_image = defaultdict(list)
        for annotation in data.get("annotations", []):
            annotations_by_image[annotation["image_id"]].append(annotation)

        for image in data.get("images", []):
            width = float(image["width"])
            height = float(image["height"])
            if width <= 0 or height <= 0:
                warnings += 1
                continue

            relative_path = PurePosixPath(image["file_name"])
            archive_path = str(parent / relative_path)
            image_labels = []

            for annotation in annotations_by_image.get(image["id"], []):
                class_name = categories.get(annotation["category_id"])
                bbox = annotation.get("bbox")
                if (
                    annotation.get("iscrowd", 0)
                    or class_name is None
                    or not bbox
                    or len(bbox) != 4
                ):
                    warnings += 1
                    continue

                x, y, box_width, box_height = map(float, bbox)
                x1 = max(0.0, min(width, x))
                y1 = max(0.0, min(height, y))
                x2 = max(0.0, min(width, x + box_width))
                y2 = max(0.0, min(height, y + box_height))
                clipped_width = x2 - x1
                clipped_height = y2 - y1
                if clipped_width <= 0 or clipped_height <= 0:
                    warnings += 1
                    continue

                image_labels.append(
                    (
                        class_name,
                        (x1 + x2) / (2 * width),
                        (y1 + y2) / (2 * height),
                        clipped_width / width,
                        clipped_height / height,
                    )
                )
                class_names.add(class_name)

            records_by_split[output_split].append(
                {
                    "archive_path": archive_path,
                    "stem": f"{source['key']}_{image['id']}",
                    "suffix": Path(relative_path.name).suffix.lower(),
                    "labels": image_labels,
                }
            )

    return records_by_split, class_names, warnings


def yolo_species_records(archive, source):
    records_by_split = defaultdict(list)
    class_names = set()
    warnings = 0

    config = yaml.safe_load(archive.read("data.yaml"))
    source_class_names = config.get("names")
    if not isinstance(source_class_names, list):
        raise ValueError(f"{source['archive']} has no supported class-name list.")

    species_by_id = {
        class_id: species_from_ripeness_label(name)
        for class_id, name in enumerate(source_class_names)
    }

    for source_split, output_split in SPLITS.items():
        image_dir = PurePosixPath(source_split) / "images"
        label_dir = PurePosixPath(source_split) / "labels"
        images = sorted(
            name
            for name in archive.namelist()
            if PurePosixPath(name).parent == image_dir
            and Path(name).suffix.lower() in IMAGE_EXTENSIONS
        )
        if source_split == "train" and not images:
            raise ValueError(
                f"No training images found in {source['archive']}::{image_dir}"
            )

        for index, image_path in enumerate(images):
            relative_image = PurePosixPath(image_path)
            label_path = str(label_dir / f"{relative_image.stem}.txt")
            image_labels = []

            try:
                label_text = archive.read(label_path).decode("utf-8")
            except KeyError:
                warnings += 1
                label_text = ""

            for line in label_text.splitlines():
                values = line.split()
                if len(values) < 5:
                    warnings += 1
                    continue

                try:
                    source_class_id = int(values[0])
                    coordinates = list(map(float, values[1:]))
                except ValueError:
                    warnings += 1
                    continue

                if (
                    source_class_id not in species_by_id
                    or not all(math.isfinite(value) for value in coordinates)
                ):
                    warnings += 1
                    continue

                if len(coordinates) == 4:
                    center_x, center_y, box_width, box_height = coordinates
                    x1 = center_x - box_width / 2
                    y1 = center_y - box_height / 2
                    x2 = center_x + box_width / 2
                    y2 = center_y + box_height / 2
                elif len(coordinates) >= 6 and len(coordinates) % 2 == 0:
                    x_coordinates = coordinates[::2]
                    y_coordinates = coordinates[1::2]
                    if any(
                        value < 0 or value > 1
                        for value in coordinates
                    ):
                        warnings += 1
                        continue
                    x1 = min(x_coordinates)
                    y1 = min(y_coordinates)
                    x2 = max(x_coordinates)
                    y2 = max(y_coordinates)
                else:
                    warnings += 1
                    continue

                x1 = max(0.0, min(1.0, x1))
                y1 = max(0.0, min(1.0, y1))
                x2 = max(0.0, min(1.0, x2))
                y2 = max(0.0, min(1.0, y2))
                box_width = x2 - x1
                box_height = y2 - y1
                if box_width <= 0 or box_height <= 0:
                    warnings += 1
                    continue

                class_name = species_by_id[source_class_id]
                class_names.add(class_name)
                image_labels.append(
                    (
                        class_name,
                        (x1 + x2) / 2,
                        (y1 + y2) / 2,
                        box_width,
                        box_height,
                    )
                )

            records_by_split[output_split].append(
                {
                    "archive_path": image_path,
                    "stem": f"{source['key']}_{index}",
                    "suffix": relative_image.suffix.lower(),
                    "labels": image_labels,
                }
            )

    return records_by_split, class_names, warnings


def main():
    archives = []
    try:
        records_by_source = []
        class_names = set()
        warning_count = 0

        for source in SOURCES:
            archive_path = ZIP_DIR / source["archive"]
            if not archive_path.is_file():
                raise FileNotFoundError(f"Dataset archive not found: {archive_path}")

            archive = zipfile.ZipFile(archive_path)
            archives.append(archive)
            if source["format"] == "coco":
                records, names, warnings = coco_records(archive, source)
            elif source["format"] == "yolo":
                records, names, warnings = yolo_species_records(archive, source)
            else:
                raise ValueError(f"Unsupported source format: {source['format']}")

            records_by_source.append((source, archive, records))
            class_names.update(names)
            warning_count += warnings

        if not class_names:
            raise ValueError("The selected archives contain no labeled produce.")
        if OUTPUT_DIR.exists():
            raise FileExistsError(
                f"Output directory already exists: {OUTPUT_DIR}. "
                "Move it aside before preparing a clean dataset."
            )

        names = sorted(class_names)
        class_ids = {name: index for index, name in enumerate(names)}
        for split in ("train", "val", "test"):
            (OUTPUT_DIR / split / "images").mkdir(parents=True, exist_ok=True)
            (OUTPUT_DIR / split / "labels").mkdir(parents=True, exist_ok=True)

        image_counts = Counter()
        label_counts = defaultdict(Counter)

        for source, archive, records_by_split in records_by_source:
            archive_names = set(archive.namelist())
            for split, records in records_by_split.items():
                for record in records:
                    archive_path = record["archive_path"]
                    if archive_path not in archive_names:
                        raise FileNotFoundError(
                            f"Missing image {source['archive']}::{archive_path}"
                        )

                    suffix = record["suffix"]
                    if suffix not in IMAGE_EXTENSIONS:
                        suffix = ".jpg"
                    stem = record["stem"]
                    image_target = OUTPUT_DIR / split / "images" / f"{stem}{suffix}"
                    label_target = OUTPUT_DIR / split / "labels" / f"{stem}.txt"
                    with archive.open(archive_path) as source_file:
                        with image_target.open("wb") as target_file:
                            shutil.copyfileobj(source_file, target_file)

                    yolo_labels = []
                    for class_name, center_x, center_y, width, height in record["labels"]:
                        yolo_labels.append(
                            f"{class_ids[class_name]} "
                            f"{center_x:.6f} {center_y:.6f} "
                            f"{width:.6f} {height:.6f}"
                        )
                        label_counts[split][class_name] += 1
                    label_target.write_text("\n".join(yolo_labels), encoding="utf-8")
                    image_counts[split] += 1

        data_yaml = (
            "path: .\n"
            "train: train/images\n"
            "val: val/images\n"
            "test: test/images\n"
            f"nc: {len(names)}\n"
            f"names: {json.dumps(names, ensure_ascii=False)}\n"
        )
        (OUTPUT_DIR / "data.yaml").write_text(data_yaml, encoding="utf-8")
        (OUTPUT_DIR / "class_map.json").write_text(
            json.dumps(
                {str(index): name for index, name in enumerate(names)},
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        source_text = "\n".join(
            f"{item['key']}: {item['url']} (license listed in archive: "
            f"{item['license']})"
            for item in SOURCES
        )
        (OUTPUT_DIR / "SOURCES.txt").write_text(
            source_text + "\n",
            encoding="utf-8",
        )

        summary = {
            "output": str(OUTPUT_DIR),
            "classes": names,
            "images_per_split": dict(image_counts),
            "annotations_per_split": {
                split: dict(sorted(counts.items()))
                for split, counts in label_counts.items()
            },
            "warnings": warning_count,
        }
        print(json.dumps(summary, indent=2, ensure_ascii=False))

        missing_train_classes = [
            name for name in names if label_counts["train"][name] == 0
        ]
        if missing_train_classes:
            print(
                "WARNING: classes without training annotations: "
                + ", ".join(missing_train_classes),
                file=sys.stderr,
            )
        missing_test_classes = [
            name for name in names if label_counts["test"][name] == 0
        ]
        if missing_test_classes:
            print(
                "WARNING: classes without test annotations: "
                + ", ".join(missing_test_classes),
                file=sys.stderr,
            )
    finally:
        for archive in archives:
            archive.close()


if __name__ == "__main__":
    main()
