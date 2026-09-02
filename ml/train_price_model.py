import os
import re
import math
import joblib
import numpy as np
import pandas as pd

from sklearn.linear_model import LinearRegression
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

PROJECT_ROOT = os.path.dirname(
    BASE_DIR
)

DATASET_PATH = os.path.join(
    PROJECT_ROOT,
    "price_data",
    "price_dataset_final.csv"
)

MODEL_DIR = os.path.join(
    BASE_DIR,
    "price_models"
)

METRICS_PATH = os.path.join(
    BASE_DIR,
    "price_model_metrics.csv"
)

FORECAST_PATH = os.path.join(
    BASE_DIR,
    "price_forecasts.csv"
)

os.makedirs(
    MODEL_DIR,
    exist_ok=True
)


# ============================================================
# CONFIGURATION
# ============================================================

TEST_RATIO = 0.20

FORECAST_HORIZONS = {
    "1_week": 7,
    "1_month": 30,
    "3_months": 90,
}


# ============================================================
# SAFE FILE NAME
# ============================================================

def safe_filename(name):

    name = re.sub(
        r"[^A-Za-z0-9]+",
        "_",
        name
    )

    return name.strip("_").lower()


# ============================================================
# CREATE DATE FEATURES
#
# We use:
#
# 1. Time trend
# 2. Seasonal sine
# 3. Seasonal cosine
#
# These allow Linear Regression to model both:
# - long-term price movement
# - yearly seasonal behavior
#
# without requiring every single week to be present.
# ============================================================

def create_features(
    dates,
    origin_date
):

    dates = pd.to_datetime(
        dates
    )

    # --------------------------------------------------------
    # LONG-TERM TREND
    # --------------------------------------------------------

    days_since_origin = (
        dates - origin_date
    ).dt.days.astype(float)

    # --------------------------------------------------------
    # SEASONALITY
    # --------------------------------------------------------

    day_of_year = (
        dates.dt.dayofyear
        .astype(float)
    )

    season_sin = np.sin(
        2
        * np.pi
        * day_of_year
        / 365.25
    )

    season_cos = np.cos(
        2
        * np.pi
        * day_of_year
        / 365.25
    )

    features = pd.DataFrame({
        "days_since_origin":
            days_since_origin,

        "season_sin":
            season_sin,

        "season_cos":
            season_cos,
    })

    return features


# ============================================================
# FORECAST ONE DATE
# ============================================================

def predict_price(
    model,
    target_date,
    origin_date
):

    target_series = pd.Series(
        [
            pd.Timestamp(
                target_date
            )
        ]
    )

    features = create_features(
        target_series,
        origin_date
    )

    prediction = model.predict(
        features
    )[0]

    return float(
        prediction
    )


# ============================================================
# FORMAT DIRECTION
# ============================================================

def direction(
    current,
    forecast
):

    difference = (
        forecast - current
    )

    # Treat less than ₱0.50 difference as stable.
    if abs(difference) < 0.50:
        return "stable"

    if difference > 0:
        return "increase"

    return "decrease"


# ============================================================
# LOAD DATA
# ============================================================

print()

print(
    "=" * 80
)

print(
    "PRICE FORECAST REGRESSION TRAINING"
)

print(
    "=" * 80
)

print(
    f"\nDataset:\n{DATASET_PATH}"
)


df = pd.read_csv(
    DATASET_PATH
)


df["week_start"] = pd.to_datetime(
    df["week_start"],
    errors="coerce"
)


df["weekly_average_price"] = (
    pd.to_numeric(
        df["weekly_average_price"],
        errors="coerce"
    )
)


df = df.dropna(
    subset=[
        "week_start",
        "commodity",
        "weekly_average_price",
    ]
)


df = df[
    df["weekly_average_price"]
    > 0
]


print(
    f"\nRecords loaded : {len(df)}"
)

print(
    f"Commodities    : "
    f"{df['commodity'].nunique()}"
)


# ============================================================
# RESULTS
# ============================================================

metrics_results = []

forecast_results = []


# ============================================================
# TRAIN ONE MODEL PER COMMODITY
# ============================================================

commodities = sorted(
    df["commodity"]
    .unique()
)


for commodity in commodities:

    print()

    print(
        "=" * 80
    )

    print(
        commodity
    )

    print(
        "=" * 80
    )

    commodity_df = (
        df[
            df["commodity"]
            == commodity
        ]
        .sort_values(
            "week_start"
        )
        .drop_duplicates(
            subset=[
                "week_start"
            ]
        )
        .reset_index(
            drop=True
        )
    )


    record_count = len(
        commodity_df
    )


    print(
        f"Records: {record_count}"
    )


    # ========================================================
    # NEED ENOUGH RECORDS
    # ========================================================

    if record_count < 10:

        print(
            "Skipped: insufficient data."
        )

        continue


    # ========================================================
    # ORIGIN DATE
    # ========================================================

    origin_date = (
        commodity_df[
            "week_start"
        ].min()
    )


    # ========================================================
    # FEATURES
    # ========================================================

    X = create_features(
        commodity_df[
            "week_start"
        ],
        origin_date
    )


    y = (
        commodity_df[
            "weekly_average_price"
        ]
        .astype(float)
    )


    # ========================================================
    # CHRONOLOGICAL TRAIN / TEST SPLIT
    #
    # DO NOT RANDOMLY SHUFFLE TIME SERIES.
    # ========================================================

    split_index = int(
        record_count
        * (
            1
            - TEST_RATIO
        )
    )


    # Make sure test set has at least 2 records.
    split_index = min(
        split_index,
        record_count - 2
    )


    X_train = X.iloc[
        :split_index
    ]

    X_test = X.iloc[
        split_index:
    ]


    y_train = y.iloc[
        :split_index
    ]

    y_test = y.iloc[
        split_index:
    ]


    # ========================================================
    # TRAIN EVALUATION MODEL
    # ========================================================

    evaluation_model = (
        LinearRegression()
    )


    evaluation_model.fit(
        X_train,
        y_train
    )


    test_predictions = (
        evaluation_model.predict(
            X_test
        )
    )


    # ========================================================
    # METRICS
    # ========================================================

    mae = mean_absolute_error(
        y_test,
        test_predictions
    )


    rmse = math.sqrt(
        mean_squared_error(
            y_test,
            test_predictions
        )
    )


    if len(y_test) >= 2:

        r2 = r2_score(
            y_test,
            test_predictions
        )

    else:

        r2 = np.nan


    print(
        f"Train records : "
        f"{len(X_train)}"
    )

    print(
        f"Test records  : "
        f"{len(X_test)}"
    )

    print(
        f"MAE           : "
        f"{mae:.2f}"
    )

    print(
        f"RMSE          : "
        f"{rmse:.2f}"
    )

    print(
        f"R²            : "
        f"{r2:.4f}"
    )


    metrics_results.append({
        "commodity":
            commodity,

        "total_records":
            record_count,

        "training_records":
            len(X_train),

        "testing_records":
            len(X_test),

        "mae":
            round(
                mae,
                4
            ),

        "rmse":
            round(
                rmse,
                4
            ),

        "r2":
            round(
                r2,
                4
            )
            if not np.isnan(r2)
            else None,
    })


    # ========================================================
    # TRAIN FINAL MODEL
    #
    # Evaluation used the chronological split.
    #
    # After measuring performance, retrain using all available
    # trusted observations so the deployed model can use all
    # historical information.
    # ========================================================

    final_model = (
        LinearRegression()
    )


    final_model.fit(
        X,
        y
    )


    # ========================================================
    # SAVE MODEL
    # ========================================================

    model_filename = (
        safe_filename(
            commodity
        )
        + ".joblib"
    )


    model_path = os.path.join(
        MODEL_DIR,
        model_filename
    )


    model_package = {
        "commodity":
            commodity,

        "model":
            final_model,

        "origin_date":
            origin_date,

        "feature_names": [
            "days_since_origin",
            "season_sin",
            "season_cos",
        ],

        "record_count":
            record_count,

        "mae":
            mae,

        "rmse":
            rmse,

        "r2":
            r2,
    }


    joblib.dump(
        model_package,
        model_path
    )


    print(
        f"Model saved   : "
        f"{model_filename}"
    )


    # ========================================================
    # LATEST ACTUAL PRICE
    # ========================================================

    latest_row = (
        commodity_df.iloc[-1]
    )


    latest_date = (
        latest_row[
            "week_start"
        ]
    )


    current_price = float(
        latest_row[
            "weekly_average_price"
        ]
    )


    # ========================================================
    # FORECASTS
    # ========================================================

    forecasts = {}


    for horizon_name, days in (
        FORECAST_HORIZONS.items()
    ):

        future_date = (
            latest_date
            + pd.Timedelta(
                days=days
            )
        )


        predicted_price = (
            predict_price(
                final_model,
                future_date,
                origin_date
            )
        )


        forecasts[
            horizon_name
        ] = {
            "date":
                future_date,

            "price":
                predicted_price,

            "direction":
                direction(
                    current_price,
                    predicted_price
                )
        }


    print()

    print(
        f"Latest actual : "
        f"₱{current_price:.2f}"
        f"/kg"
    )

    print(
        f"Latest date   : "
        f"{latest_date.date()}"
    )

    print()

    print(
        f"1 Week       : "
        f"₱{forecasts['1_week']['price']:.2f}"
        f"/kg "
        f"({forecasts['1_week']['direction']})"
    )

    print(
        f"1 Month      : "
        f"₱{forecasts['1_month']['price']:.2f}"
        f"/kg "
        f"({forecasts['1_month']['direction']})"
    )

    print(
        f"3 Months     : "
        f"₱{forecasts['3_months']['price']:.2f}"
        f"/kg "
        f"({forecasts['3_months']['direction']})"
    )


    # ========================================================
    # FORECAST CSV ROW
    # ========================================================

    forecast_results.append({

        "commodity":
            commodity,

        "latest_date":
            latest_date.date(),

        "current_price":
            round(
                current_price,
                2
            ),

        "one_week_date":
            forecasts[
                "1_week"
            ]["date"].date(),

        "one_week_forecast":
            round(
                forecasts[
                    "1_week"
                ]["price"],
                2
            ),

        "one_week_direction":
            forecasts[
                "1_week"
            ]["direction"],

        "one_month_date":
            forecasts[
                "1_month"
            ]["date"].date(),

        "one_month_forecast":
            round(
                forecasts[
                    "1_month"
                ]["price"],
                2
            ),

        "one_month_direction":
            forecasts[
                "1_month"
            ]["direction"],

        "three_month_date":
            forecasts[
                "3_months"
            ]["date"].date(),

        "three_month_forecast":
            round(
                forecasts[
                    "3_months"
                ]["price"],
                2
            ),

        "three_month_direction":
            forecasts[
                "3_months"
            ]["direction"],
    })


# ============================================================
# SAVE METRICS
# ============================================================

metrics_df = pd.DataFrame(
    metrics_results
)


metrics_df.to_csv(
    METRICS_PATH,
    index=False,
    encoding="utf-8-sig"
)


# ============================================================
# SAVE FORECASTS
# ============================================================

forecast_df = pd.DataFrame(
    forecast_results
)


forecast_df.to_csv(
    FORECAST_PATH,
    index=False,
    encoding="utf-8-sig"
)


# ============================================================
# OVERALL METRICS
# ============================================================

print()

print(
    "=" * 80
)

print(
    "OVERALL MODEL RESULTS"
)

print(
    "=" * 80
)


if not metrics_df.empty:

    print(
        f"Models trained : "
        f"{len(metrics_df)}"
    )

    print(
        f"Average MAE    : "
        f"{metrics_df['mae'].mean():.2f}"
    )

    print(
        f"Average RMSE   : "
        f"{metrics_df['rmse'].mean():.2f}"
    )

    valid_r2 = (
        metrics_df[
            "r2"
        ]
        .dropna()
    )

    if not valid_r2.empty:

        print(
            f"Average R²     : "
            f"{valid_r2.mean():.4f}"
        )


# ============================================================
# FILES
# ============================================================

print()

print(
    "=" * 80
)

print(
    "TRAINING COMPLETE"
)

print(
    "=" * 80
)

print(
    f"\nModels:\n"
    f"{MODEL_DIR}"
)

print(
    f"\nMetrics:\n"
    f"{METRICS_PATH}"
)

print(
    f"\nForecasts:\n"
    f"{FORECAST_PATH}"
)