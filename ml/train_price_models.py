import os
import json
import math
import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

DATASET_PATH = os.path.join(
    PROJECT_ROOT,
    "price_data",
    "da_weekly_model_final.csv",
)

MODEL_DIR = os.path.join(BASE_DIR, "price_models")
METRICS_PATH = os.path.join(BASE_DIR, "price_model_metrics.csv")
PREDICTIONS_PATH = os.path.join(BASE_DIR, "price_model_test_predictions.csv")
METADATA_PATH = os.path.join(MODEL_DIR, "price_model_metadata.json")

os.makedirs(MODEL_DIR, exist_ok=True)

TEST_RATIO = 0.20
MIN_SERIES_OBSERVATIONS = 16

FORECAST_HORIZONS = {
    "1w": 1,
    "2w": 2,
    "4w": 4,
}

NUMERIC_FEATURES = [
    "change_1w",
    "change_prev",
    "change_4w",
    "deviation_from_4w_mean",
    "week_of_year",
]

CATEGORICAL_FEATURES = ["series_key"]
MODEL_FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES


def prepare_source_data(df):
    required = ["week_start", "weekly_average_price"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError("Missing required columns: " + ", ".join(missing))

    df = df.copy()
    df["week_start"] = pd.to_datetime(df["week_start"], errors="coerce")
    df["weekly_average_price"] = pd.to_numeric(
        df["weekly_average_price"], errors="coerce"
    )

    df = df.dropna(subset=["week_start", "weekly_average_price"])
    df = df[df["weekly_average_price"] > 0].copy()

    if "series_key" not in df.columns:
        needed = [
            "category_normalized",
            "commodity_normalized",
            "specification_normalized",
            "unit",
        ]
        missing = [c for c in needed if c not in df.columns]
        if missing:
            raise ValueError(
                "series_key is missing and cannot be rebuilt. Missing: "
                + ", ".join(missing)
            )

        df["series_key"] = (
            df["category_normalized"].fillna("").astype(str).str.strip()
            + " | "
            + df["commodity_normalized"].fillna("").astype(str).str.strip()
            + " | "
            + df["specification_normalized"].fillna("").astype(str).str.strip()
            + " | "
            + df["unit"].fillna("").astype(str).str.strip()
        )

    return (
        df.sort_values(["series_key", "week_start"])
        .drop_duplicates(["series_key", "week_start"], keep="last")
        .reset_index(drop=True)
    )


def build_feature_dataset(df):
    all_weeks = sorted(pd.to_datetime(df["week_start"].unique()))
    week_position = {
        pd.Timestamp(week): index for index, week in enumerate(all_weeks)
    }

    feature_rows = []

    for series_key, group in df.groupby("series_key"):
        group = group.sort_values("week_start").set_index("week_start")

        if len(group) < MIN_SERIES_OBSERVATIONS:
            continue

        for current_week, row in group.iterrows():
            current_week = pd.Timestamp(current_week)
            current_index = week_position[current_week]

            if current_index < 4:
                continue

            previous_weeks = [
                pd.Timestamp(all_weeks[current_index - 1]),
                pd.Timestamp(all_weeks[current_index - 2]),
                pd.Timestamp(all_weeks[current_index - 3]),
                pd.Timestamp(all_weeks[current_index - 4]),
            ]

            if not all(week in group.index for week in previous_weeks):
                continue

            current_price = float(row["weekly_average_price"])
            lag_1 = float(group.loc[previous_weeks[0], "weekly_average_price"])
            lag_2 = float(group.loc[previous_weeks[1], "weekly_average_price"])
            lag_3 = float(group.loc[previous_weeks[2], "weekly_average_price"])
            lag_4 = float(group.loc[previous_weeks[3], "weekly_average_price"])

            previous_4week_mean = np.mean([lag_1, lag_2, lag_3, lag_4])

            result = {
                "week_start": current_week,
                "series_key": series_key,
                "current_price": current_price,
                "change_1w": current_price - lag_1,
                "change_prev": lag_1 - lag_2,
                "change_4w": current_price - lag_4,
                "deviation_from_4w_mean": current_price - previous_4week_mean,
                "week_of_year": int(current_week.isocalendar().week),
            }

            for source_col, output_col in [
                ("category_normalized", "category"),
                ("commodity_normalized", "commodity"),
                ("specification_normalized", "specification"),
                ("unit", "unit"),
            ]:
                if source_col in row.index:
                    result[output_col] = row[source_col]

            for horizon_name, horizon_weeks in FORECAST_HORIZONS.items():
                target_col = f"target_price_{horizon_name}"
                future_index = current_index + horizon_weeks

                if future_index >= len(all_weeks):
                    result[target_col] = np.nan
                    continue

                future_week = pd.Timestamp(all_weeks[future_index])

                if future_week not in group.index:
                    result[target_col] = np.nan
                    continue

                result[target_col] = float(
                    group.loc[future_week, "weekly_average_price"]
                )

            feature_rows.append(result)

    features = pd.DataFrame(feature_rows)

    if features.empty:
        raise ValueError(
            "No usable feature rows were created. Check weekly coverage and data."
        )

    return (
        features.sort_values(["week_start", "series_key"])
        .reset_index(drop=True)
    )


def create_model():
    preprocessing = ColumnTransformer(
        transformers=[
            (
                "series",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
            (
                "numeric",
                "passthrough",
                NUMERIC_FEATURES,
            ),
        ]
    )

    return Pipeline(
        steps=[
            ("preprocess", preprocessing),
            ("regression", LinearRegression()),
        ]
    )


def chronological_split(data):
    unique_weeks = np.array(sorted(data["week_start"].unique()))
    split_index = int(len(unique_weeks) * (1 - TEST_RATIO))
    split_index = max(1, min(split_index, len(unique_weeks) - 1))

    cutoff_week = pd.Timestamp(unique_weeks[split_index])

    train = data[data["week_start"] < cutoff_week].copy()
    test = data[data["week_start"] >= cutoff_week].copy()

    return train, test, cutoff_week


def evaluate_horizon(features, horizon_name):
    target_col = f"target_price_{horizon_name}"

    data = features.dropna(subset=[target_col]).copy()
    data["target_change"] = data[target_col] - data["current_price"]

    train, test, cutoff_week = chronological_split(data)

    if train.empty or test.empty:
        raise ValueError(f"Not enough data to evaluate {horizon_name}")

    evaluation_model = create_model()
    evaluation_model.fit(
        train[MODEL_FEATURES],
        train["target_change"],
    )

    predicted_change = evaluation_model.predict(test[MODEL_FEATURES])
    predicted_price = test["current_price"].to_numpy(float) + predicted_change
    actual_price = test[target_col].to_numpy(float)
    baseline_price = test["current_price"].to_numpy(float)

    mae = mean_absolute_error(actual_price, predicted_price)
    rmse = math.sqrt(mean_squared_error(actual_price, predicted_price))
    r2 = r2_score(actual_price, predicted_price)

    baseline_mae = mean_absolute_error(actual_price, baseline_price)
    baseline_rmse = math.sqrt(
        mean_squared_error(actual_price, baseline_price)
    )
    baseline_r2 = r2_score(actual_price, baseline_price)

    predictions = test[
        ["week_start", "series_key", "current_price", target_col]
    ].copy()

    for col in ["category", "commodity", "specification", "unit"]:
        if col in test.columns:
            predictions[col] = test[col].values

    predictions["horizon"] = horizon_name
    predictions["actual_future_price"] = actual_price
    predictions["predicted_change"] = predicted_change
    predictions["predicted_price"] = predicted_price
    predictions["baseline_prediction"] = baseline_price
    predictions["absolute_error"] = np.abs(actual_price - predicted_price)
    predictions["baseline_absolute_error"] = np.abs(
        actual_price - baseline_price
    )

    metrics = {
        "horizon": horizon_name,
        "cutoff_week": cutoff_week.date().isoformat(),
        "training_records": len(train),
        "testing_records": len(test),
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "baseline_mae": baseline_mae,
        "baseline_rmse": baseline_rmse,
        "baseline_r2": baseline_r2,
        "beats_baseline_mae": mae < baseline_mae,
    }

    return metrics, predictions, data


def train_final_model(data, horizon_name):
    model = create_model()

    model.fit(
        data[MODEL_FEATURES],
        data["target_change"],
    )

    model_package = {
        "model": model,
        "horizon": horizon_name,
        "features": MODEL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target": "future_price_change",
        "forecast_formula": "current_price + predicted_change",
        "minimum_series_observations": MIN_SERIES_OBSERVATIONS,
        "training_records": len(data),
    }

    model_path = os.path.join(
        MODEL_DIR,
        f"price_model_{horizon_name}.joblib",
    )

    joblib.dump(model_package, model_path)

    return model_path


def main():
    print()
    print("=" * 80)
    print("FINAL DA PRICE FORECAST LINEAR REGRESSION TRAINING")
    print("=" * 80)
    print(f"\nDataset:\n{DATASET_PATH}")

    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(
            "\nDataset not found.\n"
            f"Expected:\n{DATASET_PATH}\n\n"
            "Place the corrected normalized DA dataset at that path first."
        )

    raw_df = pd.read_csv(DATASET_PATH)
    source_df = prepare_source_data(raw_df)
    features = build_feature_dataset(source_df)

    print(f"\nSource records   : {len(source_df):,}")
    print(f"Usable series    : {features['series_key'].nunique():,}")
    print(f"Feature rows     : {len(features):,}")

    metrics_rows = []
    prediction_frames = []

    for horizon_name in FORECAST_HORIZONS:
        print()
        print("-" * 80)
        print(f"HORIZON: {horizon_name.upper()}")
        print("-" * 80)

        metrics, predictions, horizon_data = evaluate_horizon(
            features,
            horizon_name,
        )

        metrics_rows.append(metrics)
        prediction_frames.append(predictions)

        model_path = train_final_model(
            horizon_data,
            horizon_name,
        )

        print(f"Train rows       : {metrics['training_records']:,}")
        print(f"Test rows        : {metrics['testing_records']:,}")
        print(f"Cutoff week      : {metrics['cutoff_week']}")
        print(f"Model MAE        : ₱{metrics['mae']:.2f}")
        print(f"Model RMSE       : ₱{metrics['rmse']:.2f}")
        print(f"Model R²         : {metrics['r2']:.4f}")
        print(f"Baseline MAE     : ₱{metrics['baseline_mae']:.2f}")
        print(
            "Beats baseline?  : "
            + ("YES" if metrics["beats_baseline_mae"] else "NO")
        )
        print(f"Saved model      : {os.path.basename(model_path)}")

    metrics_df = pd.DataFrame(metrics_rows)
    metrics_df.to_csv(
        METRICS_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    all_predictions = pd.concat(
        prediction_frames,
        ignore_index=True,
    )

    all_predictions.to_csv(
        PREDICTIONS_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    metadata = {
        "model_type": "LinearRegression",
        "source": "Department of Agriculture weekly retail price data",
        "dataset": os.path.basename(DATASET_PATH),
        "features": MODEL_FEATURES,
        "target": "future_price_change",
        "forecast_formula": "current_price + predicted_change",
        "horizons": FORECAST_HORIZONS,
        "test_ratio": TEST_RATIO,
        "split_method": "chronological by unique reporting week",
        "minimum_series_observations": MIN_SERIES_OBSERVATIONS,
        "baseline": "future price equals current price",
    }

    with open(METADATA_PATH, "w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2)

    print()
    print("=" * 80)
    print("TRAINING COMPLETE")
    print("=" * 80)
    print(f"\nModels:\n{MODEL_DIR}")
    print(f"\nMetrics:\n{METRICS_PATH}")
    print(f"\nTest predictions:\n{PREDICTIONS_PATH}")
    print(f"\nMetadata:\n{METADATA_PATH}")


if __name__ == "__main__":
    main()
