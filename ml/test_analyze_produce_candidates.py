import unittest
from unittest.mock import patch

from analyze_produce_pipeline import (
    classify_ripeness,
    group_detector_predictions,
    identity_candidates,
    recommendation_for,
)


def prediction(model, class_id, class_name, confidence, coordinates):
    return {
        "model": model,
        "class_id": class_id,
        "class_name": class_name,
        "confidence": confidence,
        "coordinates": coordinates,
    }


class DetectorCandidateTests(unittest.TestCase):
    def test_overlapping_model_boxes_become_identity_candidates(self):
        groups = group_detector_predictions([
            prediction("active", 0, "apple", 0.91, [10, 10, 90, 90]),
            prediction("extended", 34, "tomato", 0.72, [12, 12, 88, 88]),
            prediction("active", 1, "banana", 0.8, [120, 10, 190, 90]),
        ])

        self.assertEqual(len(groups), 2)
        candidates = identity_candidates(groups[0]["predictions"])
        self.assertEqual([candidate["normalizedName"] for candidate in candidates],
                         ["apple", "tomato"])
        self.assertEqual(candidates[0]["modelScores"], [
            {"model": "active", "score": 0.91},
        ])
        self.assertEqual(candidates[1]["modelScores"], [
            {"model": "extended", "score": 0.72},
        ])

    def test_aliases_from_both_models_merge_without_losing_scores(self):
        candidates = identity_candidates([
            prediction("active", 16, "kamatis", 0.8, [0, 0, 100, 100]),
            prediction("extended", 33, "tomato", 0.7, [1, 1, 99, 99]),
        ])

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["normalizedName"], "tomato")
        self.assertEqual(candidates[0]["modelScores"], [
            {"model": "active", "score": 0.8},
            {"model": "extended", "score": 0.7},
        ])

    def test_tropical_aliases_merge_with_existing_detector_scores(self):
        candidates = identity_candidates([
            prediction("tropical", 2, "atis", 0.88, [0, 0, 100, 100]),
            prediction("active", 7, "sugar_apple", 0.71, [1, 1, 99, 99]),
        ])

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["normalizedName"], "sugar_apple")
        self.assertEqual(candidates[0]["label"], "Sugar apple (atis)")
        self.assertEqual(candidates[0]["modelScores"], [
            {"model": "active", "score": 0.71},
            {"model": "tropical", "score": 0.88},
        ])

    def test_existing_detector_candidate_keeps_precedence_over_tropical_only(self):
        candidates = identity_candidates([
            prediction("tropical", 22, "jackfruit", 0.97, [0, 0, 100, 100]),
            prediction("active", 0, "apple", 0.4, [110, 0, 200, 100]),
        ])

        self.assertEqual(
            [candidate["normalizedName"] for candidate in candidates],
            ["apple", "jackfruit"],
        )


class RipenessTandemTests(unittest.TestCase):
    def setUp(self):
        self.freshness = {"label": "Fresh"}
        self.models = {
            "active_classifier": object(),
            "extended_tree": object(),
            "extended_cnn": object(),
            "new_cnn": object(),
            "feature_model": object(),
        }

    @staticmethod
    def result(label, score=0.8):
        return {
            "status": "classified",
            "label": label,
            "score": score,
            "probabilities": {label: score},
        }

    @patch("analyze_produce_pipeline.new_cnn_prediction")
    @patch("analyze_produce_pipeline.ripeness_prediction")
    def test_shared_active_class_requires_agreement(self, active_prediction, candidate):
        active_prediction.return_value = self.result("Ripe", 0.82)
        candidate.return_value = self.result("Ripe", 0.76)

        result = classify_ripeness("banana", self.freshness, object(), self.models)

        self.assertEqual(result["status"], "classified")
        self.assertEqual(result["label"], "Ripe")
        self.assertEqual(result["model"], "active_tandem")
        self.assertIn("newImageClassifier", result["candidatePredictions"])

        candidate.return_value = self.result("Unripe", 0.9)
        result = classify_ripeness("banana", self.freshness, object(), self.models)
        self.assertEqual(result["status"], "uncertain")
        self.assertEqual(result["label"], "Uncertain")

    @patch("analyze_produce_pipeline.new_cnn_prediction")
    def test_tomato_semiripe_is_not_reported_without_test_support(self, candidate):
        candidate.return_value = self.result("Semi-ripe", 0.91)

        result = classify_ripeness("tomato", self.freshness, object(), self.models)

        self.assertEqual(result["status"], "uncertain")
        self.assertEqual(result["candidatePredictions"]["newImageClassifier"]["label"],
                         "Semi-ripe")

    @patch("analyze_produce_pipeline.new_cnn_prediction")
    def test_new_fruit_candidate_returns_supported_experimental_stage(self, candidate):
        candidate.return_value = self.result("Overripe", 0.87)

        result = classify_ripeness("avocado", self.freshness, object(), self.models)

        self.assertEqual(result["status"], "classified")
        self.assertEqual(result["label"], "Overripe")
        self.assertTrue(result["experimental"])
        self.assertIn("no existing fruit-specific", result["message"])

    @patch("analyze_produce_pipeline.new_cnn_prediction")
    @patch("analyze_produce_pipeline.extended_cnn_prediction")
    @patch("analyze_produce_pipeline.ripeness_prediction")
    def test_extended_classes_use_two_of_three_consensus(
        self,
        tree_prediction,
        existing_cnn_prediction,
        new_cnn_prediction,
    ):
        tree_prediction.return_value = self.result("Ripe", 0.7)
        existing_cnn_prediction.return_value = self.result("Unripe", 0.8)
        new_cnn_prediction.return_value = self.result("Ripe", 0.9)

        result = classify_ripeness("papaya", self.freshness, object(), self.models)

        self.assertEqual(result["status"], "classified")
        self.assertEqual(result["label"], "Ripe")
        self.assertIn("2 ripeness models agree", result["message"])

    def test_turning_recommendation_is_cautious(self):
        recommendation = recommendation_for(
            {"label": "Fresh"},
            {"status": "classified", "label": "Turning"},
        )

        self.assertIn("transitioning in ripeness", recommendation)


if __name__ == "__main__":
    unittest.main()
