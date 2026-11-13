import unittest

from ml.validate_sampling_data import (
    bbox_fits_image,
    percentage_in_range,
    validate_confusion_matrix,
)


class SamplingDataValidationTests(unittest.TestCase):
    def test_percentage_range_requires_finite_numbers_from_zero_to_one_hundred(self):
        for value in (0, 100, 54.2):
            with self.subTest(value=value):
                self.assertTrue(percentage_in_range(value))

        for value in (-0.1, 100.1, "50", float("nan"), float("inf")):
            with self.subTest(value=value):
                self.assertFalse(percentage_in_range(value))

    def test_bbox_boundary_check_allows_rounding_but_rejects_real_overflow(self):
        self.assertTrue(bbox_fits_image(0.710156, 0.125781, 0.292969, 0.251563))
        self.assertFalse(bbox_fits_image(0.1, 0.5, 0.3, 0.2))

    def test_confusion_matrix_checks_counts_support_and_accuracy_consistency(self):
        checks = validate_confusion_matrix(
            "sample",
            [[8, 2], [1, 9]],
            ["Fresh", "Rotten"],
            expected_total=20,
            expected_accuracy=0.85,
            expected_row_totals=[10, 10],
        )

        self.assertTrue(all(check["status"] == "PASS" for check in checks))

    def test_confusion_matrix_rejects_non_integer_counts(self):
        checks = validate_confusion_matrix(
            "sample",
            [[8, 2], [1, 9.0]],
            ["Fresh", "Rotten"],
            expected_total=20,
            expected_accuracy=0.85,
            expected_row_totals=[10, 10],
        )

        self.assertEqual(checks[0]["status"], "FAIL")
        self.assertEqual(checks[1]["status"], "PASS")
        self.assertFalse(any(check["check"] == "confusion-matrix totals" for check in checks))

    def test_confusion_matrix_rejects_inconsistent_totals(self):
        checks = validate_confusion_matrix(
            "sample",
            [[8, 2], [1, 9]],
            ["Fresh", "Rotten"],
            expected_total=21,
            expected_accuracy=0.85,
            expected_row_totals=[10, 10],
        )

        self.assertEqual(
            next(check["status"] for check in checks if check["check"] == "confusion-matrix totals"),
            "FAIL",
        )

    def test_confusion_matrix_rejects_accuracy_mismatch(self):
        checks = validate_confusion_matrix(
            "sample",
            [[8, 2], [1, 9]],
            ["Fresh", "Rotten"],
            expected_total=20,
            expected_accuracy=0.9,
        )

        self.assertEqual(
            next(check["status"] for check in checks if check["check"] == "accuracy consistency"),
            "FAIL",
        )


if __name__ == "__main__":
    unittest.main()
