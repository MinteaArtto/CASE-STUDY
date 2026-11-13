import unittest

from ml.prepare_training_datasets import sample_records_by_class


def make_record(image, *classes):
    return {
        "archive": "source.zip",
        "image": image,
        "labels": [(class_name, 0.5, 0.5, 0.2, 0.2) for class_name in classes],
    }


class SampleRecordsByClassTests(unittest.TestCase):
    def test_selects_deterministic_unique_images_covering_class_targets(self):
        records = [
            make_record("a-mixed.jpg", "apple", "banana"),
            make_record("a-1.jpg", "apple"),
            make_record("a-2.jpg", "apple"),
            make_record("b-1.jpg", "banana"),
            make_record("b-2.jpg", "banana"),
        ]

        first = sample_records_by_class(records, ["apple", "banana"], 2, 43)
        second = sample_records_by_class(records, ["apple", "banana"], 2, 43)

        self.assertEqual(
            [record["image"] for record in first],
            [record["image"] for record in second],
        )
        self.assertEqual(len({record["image"] for record in first}), len(first))
        counts = {}
        for record in first:
            for class_name in {label[0] for label in record["labels"]}:
                counts[class_name] = counts.get(class_name, 0) + 1
        self.assertGreaterEqual(counts["apple"], 2)
        self.assertGreaterEqual(counts["banana"], 2)

    def test_keeps_all_records_without_a_limit(self):
        records = [make_record("one.jpg", "apple"), make_record("two.jpg", "banana")]

        self.assertEqual(
            sample_records_by_class(records, ["apple", "banana"], None, 43),
            records,
        )


if __name__ == "__main__":
    unittest.main()
