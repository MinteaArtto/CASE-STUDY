import os
import sys
import json
import joblib
import numpy as np
import pandas as pd


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

DATASET_PATH = os.path.join(
    PROJECT_ROOT,
    "price_data",
    "da_weekly_model_final.csv",
)

MODEL_DIR = os.path.join(BASE_DIR, "price_models")

MODEL_FILES = {
    "1w": os.path.join(MODEL_DIR, "price_model_1w.joblib"),
    "2w": os.path.join(MODEL_DIR, "price_model_2w.joblib"),
    "4w": os.path.join(MODEL_DIR, "price_model_4w.joblib"),
}

FEATURE_COLUMNS = [
    "series_key",
    "change_1w",
    "change_prev",
    "change_4w",
    "deviation_from_4w_mean",
    "week_of_year",
]


def load_dataset():
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH)

    df["week_start"] = pd.to_datetime(df["week_start"], errors="coerce")
    df["weekly_average_price"] = pd.to_numeric(
        df["weekly_average_price"], errors="coerce"
    )

    df = df.dropna(
        subset=["week_start", "weekly_average_price", "series_key"]
    )

    df = df[df["weekly_average_price"] > 0].copy()

    return df


def get_series_history(df, series_key):
    history = (
        df[df["series_key"] == series_key]
        .sort_values("week_start")
        .drop_duplicates(subset=["week_start"], keep="last")
        .reset_index(drop=True)
    )

    if history.empty:
        raise ValueError(f"No records found for series_key: {series_key}")

    if len(history) < 16:
        raise ValueError(
            f"This series has only {len(history)} historical records. "
            "At least 16 observations are required."
        )

    return history


def calculate_latest_features(history, series_key):
    latest_five = history.tail(5).copy()

    prices = latest_five["weekly_average_price"].astype(float).tolist()

    lag_4 = prices[0]
    lag_3 = prices[1]
    lag_2 = prices[2]
    lag_1 = prices[3]
    current_price = prices[4]

    previous_4week_mean = np.mean([lag_1, lag_2, lag_3, lag_4])

    latest_date = pd.Timestamp(latest_five.iloc[-1]["week_start"])

    feature_row = pd.DataFrame(
        [{
            "series_key": series_key,
            "change_1w": current_price - lag_1,
            "change_prev": lag_1 - lag_2,
            "change_4w": current_price - lag_4,
            "deviation_from_4w_mean": current_price - previous_4week_mean,
            "week_of_year": int(latest_date.isocalendar().week),
        }]
    )

    return feature_row, current_price, latest_date


def load_model(horizon):
    path = MODEL_FILES[horizon]

    if not os.path.exists(path):
        raise FileNotFoundError(f"Model not found: {path}")

    package = joblib.load(path)

    if "model" not in package:
        raise ValueError(f"Invalid model package for {horizon}")

    return package["model"]


def get_direction(current_price, forecast_price):
    difference = forecast_price - current_price

    if abs(difference) < 0.50:
        return "stable"
    if difference > 0:
        return "increase"
    return "decrease"


def forecast_series(series_key):
    df = load_dataset()
    history = get_series_history(df, series_key)

    feature_row, current_price, latest_date = calculate_latest_features(
        history,
        series_key,
    )

    latest_record = history.iloc[-1]

    result = {
        "series_key": series_key,
        "category": latest_record.get("category_normalized", None),
        "commodity": latest_record.get("commodity_normalized", None),
        "specification": latest_record.get("specification_normalized", None),
        "unit": latest_record.get("unit", None),
        "latest_date": latest_date.date().isoformat(),
        "current_price": round(current_price, 2),
        "forecasts": {},
    }

    for horizon in ["1w", "2w", "4w"]:
        model = load_model(horizon)

        predicted_change = float(
            model.predict(feature_row[FEATURE_COLUMNS])[0]
        )

        predicted_price = current_price + predicted_change

        result["forecasts"][horizon] = {
            "predicted_change": round(predicted_change, 2),
            "predicted_price": round(predicted_price, 2),
            "direction": get_direction(current_price, predicted_price),
        }

    return result


def get_eligible_series(limit=None):
    df = load_dataset()

    counts = (
        df.groupby("series_key")
        .size()
        .rename("record_count")
        .reset_index()
    )

    eligible_keys = counts[counts["record_count"] >= 16]["series_key"]

    series = (
        df[df["series_key"].isin(eligible_keys)][
            [
                "series_key",
                "category_normalized",
                "commodity_normalized",
                "specification_normalized",
                "unit",
            ]
        ]
        .drop_duplicates()
        .merge(counts, on="series_key", how="left")
        .sort_values(
            ["commodity_normalized", "specification_normalized"]
        )
    )

    if limit is not None:
        series = series.head(limit)

    records = []

    for _, row in series.iterrows():
        specification = row["specification_normalized"]
        if pd.isna(specification):
            specification = "(no specification)"

        records.append(
            {
                "series_key": row["series_key"],
                "category": row["category_normalized"],
                "commodity": row["commodity_normalized"],
                "specification": specification,
                "unit": row["unit"],
                "record_count": int(row["record_count"]),
            }
        )

    return records


def main():
    try:
        # API mode:
        # python predict_price.py --forecast "<series_key>"
        if len(sys.argv) >= 3 and sys.argv[1] == "--forecast":
            series_key = sys.argv[2]
            print(json.dumps(forecast_series(series_key), ensure_ascii=False))
            return

        # API mode:
        # python predict_price.py --products
        if len(sys.argv) >= 2 and sys.argv[1] == "--products":
            print(json.dumps(get_eligible_series(), ensure_ascii=False))
            return

        # Manual test mode
        print()
        print("=" * 80)
        print("DA PRICE FORECAST PREDICTION")
        print("=" * 80)

        series = get_eligible_series(limit=20)

        print("\nFORECAST-ELIGIBLE SERIES (first 20)")
        print("-" * 80)

        for row in series:
            print(
                f"{row['commodity']} | "
                f"{row['specification']} | "
                f"{row['unit']} "
                f"({row['record_count']} records)"
            )
            print(f"series_key: {row['series_key']}")
            print()

        series_key = input("\nEnter series_key: ").strip()

        if not series_key:
            raise ValueError("series_key cannot be empty.")

        result = forecast_series(series_key)

        print()
        print("=" * 80)
        print("FORECAST RESULT")
        print("=" * 80)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    except Exception as error:
        # Important for Node: errors go to stderr and exit with failure.
        print(str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
