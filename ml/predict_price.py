import os
import sys
import json
import joblib
import numpy as np
import pandas as pd


# Force UTF-8 output so Node.js can receive DA commodity names
# containing characters such as the superscript "ᵃ".
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

DATASET_PATH = os.path.join(
    PROJECT_ROOT,
    "price_data",
    "da_weekly_model_final.csv",
)

CATALOG_PATH = os.path.join(
    PROJECT_ROOT,
    "price_data",
    "current_catalog_forecast_eligibility.csv",
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


# ============================================================
# JSON SAFETY
# ============================================================

def clean_json_value(value):
    """
    Convert pandas / NumPy missing values into normal JSON-safe values.
    Prevents invalid JSON such as NaN from being sent to Node.js.
    """
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, (np.integer,)):
        return int(value)

    if isinstance(value, (np.floating,)):
        value = float(value)
        if not np.isfinite(value):
            return None
        return value

    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()

    return value


def print_json(data):
    """
    Strict JSON output for the Node.js backend.
    """
    print(
        json.dumps(
            data,
            ensure_ascii=False,
            allow_nan=False,
        )
    )


# ============================================================
# LOAD DATASET
# ============================================================

def load_dataset():
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(
            f"Dataset not found: {DATASET_PATH}"
        )

    df = pd.read_csv(DATASET_PATH)

    required = {
        "week_start",
        "weekly_average_price",
        "series_key",
        "category_normalized",
        "commodity_normalized",
        "specification_normalized",
        "unit",
    }

    missing = required.difference(df.columns)

    if missing:
        raise ValueError(
            "Dataset is missing required columns: "
            + ", ".join(sorted(missing))
        )

    df["week_start"] = pd.to_datetime(
        df["week_start"],
        errors="coerce",
    )

    df["weekly_average_price"] = pd.to_numeric(
        df["weekly_average_price"],
        errors="coerce",
    )

    df = df.dropna(
        subset=[
            "week_start",
            "weekly_average_price",
            "series_key",
        ]
    )

    df = df[
        df["weekly_average_price"] > 0
    ].copy()

    return df


# ============================================================
# LOAD CURRENT 100-ENTRY CATALOG
# ============================================================

def load_catalog():
    if not os.path.exists(CATALOG_PATH):
        raise FileNotFoundError(
            "Current price catalog not found: "
            f"{CATALOG_PATH}"
        )

    catalog = pd.read_csv(CATALOG_PATH)

    required = {
        "series_key",
        "category",
        "commodity",
        "specification",
        "unit",
        "numeric_observations",
        "first_numeric_week",
        "latest_numeric_week",
        "latest_numeric_price",
        "latest_pdf_price",
        "latest_pdf_availability",
        "forecast_eligible_16_plus",
    }

    missing = required.difference(catalog.columns)

    if missing:
        raise ValueError(
            "Catalog is missing required columns: "
            + ", ".join(sorted(missing))
        )

    catalog["numeric_observations"] = pd.to_numeric(
        catalog["numeric_observations"],
        errors="coerce",
    ).fillna(0).astype(int)

    catalog["forecast_available"] = (
        catalog["forecast_eligible_16_plus"]
        .astype(str)
        .str.strip()
        .str.lower()
        .eq("yes")
    )

    return catalog


# ============================================================
# SERIES HISTORY
# ============================================================

def get_series_history(df, series_key):
    history = (
        df[df["series_key"] == series_key]
        .sort_values("week_start")
        .drop_duplicates(
            subset=["week_start"],
            keep="last",
        )
        .reset_index(drop=True)
    )

    if history.empty:
        raise ValueError(
            f"No records found for series_key: {series_key}"
        )

    if len(history) < 16:
        raise ValueError(
            f"This series has only {len(history)} historical records. "
            "At least 16 observations are required."
        )

    return history


# ============================================================
# FEATURE CALCULATION
# ============================================================

def calculate_latest_features(history, series_key):
    if len(history) < 5:
        raise ValueError(
            "At least 5 numeric records are required "
            "to calculate the latest forecasting features."
        )

    latest_five = history.tail(5).copy()

    prices = (
        latest_five["weekly_average_price"]
        .astype(float)
        .tolist()
    )

    lag_4 = prices[0]
    lag_3 = prices[1]
    lag_2 = prices[2]
    lag_1 = prices[3]
    current_price = prices[4]

    previous_4week_mean = np.mean(
        [lag_1, lag_2, lag_3, lag_4]
    )

    latest_date = pd.Timestamp(
        latest_five.iloc[-1]["week_start"]
    )

    feature_row = pd.DataFrame(
        [
            {
                "series_key": series_key,
                "change_1w": current_price - lag_1,
                "change_prev": lag_1 - lag_2,
                "change_4w": current_price - lag_4,
                "deviation_from_4w_mean":
                    current_price - previous_4week_mean,
                "week_of_year":
                    int(latest_date.isocalendar().week),
            }
        ]
    )

    return feature_row, current_price, latest_date


# ============================================================
# MODEL LOADING
# ============================================================

def load_model(horizon):
    path = MODEL_FILES[horizon]

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Model not found: {path}"
        )

    package = joblib.load(path)

    if not isinstance(package, dict):
        raise ValueError(
            f"Invalid model package for {horizon}"
        )

    if "model" not in package:
        raise ValueError(
            f"Invalid model package for {horizon}: "
            "'model' key is missing."
        )

    return package["model"]


# ============================================================
# HELPERS
# ============================================================

def get_direction(current_price, forecast_price):
    difference = forecast_price - current_price

    if abs(difference) < 0.50:
        return "stable"

    if difference > 0:
        return "increase"

    return "decrease"


def get_catalog_record(series_key):
    catalog = load_catalog()

    matched = catalog[
        catalog["series_key"] == series_key
    ]

    if matched.empty:
        raise ValueError(
            "This series is not part of the current "
            "100-entry DA commodity catalog."
        )

    return matched.iloc[0]


# ============================================================
# FORECAST ONE CURRENT SERIES
# ============================================================

def forecast_series(series_key):
    catalog_record = get_catalog_record(series_key)

    if not bool(catalog_record["forecast_available"]):
        observations = int(
            catalog_record["numeric_observations"]
        )

        raise ValueError(
            "Insufficient historical data for forecasting. "
            f"This current commodity has {observations} numeric "
            "historical observations; at least 16 are required."
        )

    df = load_dataset()

    history = get_series_history(
        df,
        series_key,
    )

    (
        feature_row,
        current_price,
        latest_date,
    ) = calculate_latest_features(
        history,
        series_key,
    )

    result = {
        "series_key": series_key,
        "category": clean_json_value(
            catalog_record["category"]
        ),
        "commodity": clean_json_value(
            catalog_record["commodity"]
        ),
        "specification": clean_json_value(
            catalog_record["specification"]
        ),
        "unit": clean_json_value(
            catalog_record["unit"]
        ),
        "latest_date": latest_date.date().isoformat(),
        "current_price": round(
            float(current_price),
            2,
        ),
        "record_count": len(history),
        "forecast_available": True,
        "latest_pdf_price": clean_json_value(
            catalog_record["latest_pdf_price"]
        ),
        "latest_pdf_availability": clean_json_value(
            catalog_record["latest_pdf_availability"]
        ),
        "uses_latest_available_historical_price": (
            str(
                catalog_record["latest_pdf_availability"]
            ).strip().lower()
            != "available"
        ),
        "forecasts": {},
    }

    for horizon in ["1w", "2w", "4w"]:
        model = load_model(horizon)

        predicted_change = float(
            model.predict(
                feature_row[FEATURE_COLUMNS]
            )[0]
        )

        predicted_price = (
            current_price
            + predicted_change
        )

        result["forecasts"][horizon] = {
            "predicted_change": round(
                predicted_change,
                2,
            ),
            "predicted_price": round(
                predicted_price,
                2,
            ),
            "direction": get_direction(
                current_price,
                predicted_price,
            ),
        }

    return result


# ============================================================
# RETURN ALL 100 CURRENT CATALOG ENTRIES
# ============================================================

def get_current_catalog(limit=None):
    catalog = load_catalog().copy()

    catalog = catalog.sort_values(
        [
            "category",
            "commodity",
            "specification",
        ],
        na_position="last",
    )

    if limit is not None:
        catalog = catalog.head(limit)

    records = []

    for _, row in catalog.iterrows():
        specification = clean_json_value(
            row["specification"]
        )

        if specification is None or str(
            specification
        ).strip() == "":
            specification = "(no specification)"

        forecast_available = bool(
            row["forecast_available"]
        )

        numeric_observations = int(
            row["numeric_observations"]
        )

        if forecast_available:
            status = "forecast_available"
            message = None
        else:
            status = "insufficient_historical_data"
            message = (
                "Insufficient historical data for forecasting. "
                f"{numeric_observations} numeric observations "
                "are currently available; at least 16 are required."
            )

        records.append(
            {
                "series_key": clean_json_value(
                    row["series_key"]
                ),
                "category": clean_json_value(
                    row["category"]
                ),
                "commodity": clean_json_value(
                    row["commodity"]
                ),
                "specification": specification,
                "unit": clean_json_value(
                    row["unit"]
                ),
                "record_count": numeric_observations,
                "forecast_available": forecast_available,
                "forecast_status": status,
                "forecast_message": message,
                "first_numeric_week": clean_json_value(
                    row["first_numeric_week"]
                ),
                "latest_numeric_week": clean_json_value(
                    row["latest_numeric_week"]
                ),
                "latest_numeric_price": clean_json_value(
                    row["latest_numeric_price"]
                ),
                "latest_pdf_price": clean_json_value(
                    row["latest_pdf_price"]
                ),
                "latest_pdf_availability": clean_json_value(
                    row["latest_pdf_availability"]
                ),
            }
        )

    return records


# ============================================================
# CLI
# ============================================================

def main():
    try:
        # ----------------------------------------------------
        # API:
        # python predict_price.py --forecast "<series_key>"
        # ----------------------------------------------------
        if (
            len(sys.argv) >= 3
            and sys.argv[1] == "--forecast"
        ):
            series_key = sys.argv[2].strip()

            if not series_key:
                raise ValueError(
                    "series_key cannot be empty."
                )

            print_json(
                forecast_series(series_key)
            )
            return

        # ----------------------------------------------------
        # API:
        # python predict_price.py --products
        #
        # Returns ALL 100 current DA catalog entries,
        # including the 4 with insufficient history.
        # ----------------------------------------------------
        if (
            len(sys.argv) >= 2
            and sys.argv[1] == "--products"
        ):
            print_json(
                get_current_catalog()
            )
            return

        # ----------------------------------------------------
        # MANUAL TEST MODE
        # ----------------------------------------------------
        print()
        print("=" * 80)
        print("DA PRICE FORECAST PREDICTION")
        print("=" * 80)

        products = get_current_catalog(
            limit=20
        )

        print(
            "\nCURRENT DA CATALOG "
            "(first 20 entries)"
        )
        print("-" * 80)

        for row in products:
            availability = (
                "FORECAST AVAILABLE"
                if row["forecast_available"]
                else "INSUFFICIENT HISTORY"
            )

            print(
                f"{row['commodity']} | "
                f"{row['specification']} | "
                f"{row['unit']} | "
                f"{availability} | "
                f"{row['record_count']} records"
            )

            print(
                f"series_key: "
                f"{row['series_key']}"
            )
            print()

        series_key = input(
            "\nEnter series_key: "
        ).strip()

        if not series_key:
            raise ValueError(
                "series_key cannot be empty."
            )

        result = forecast_series(
            series_key
        )

        print()
        print("=" * 80)
        print("FORECAST RESULT")
        print("=" * 80)

        print(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False,
                allow_nan=False,
            )
        )

    except Exception as error:
        # Node.js reads this from stderr.
        print(
            str(error),
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
