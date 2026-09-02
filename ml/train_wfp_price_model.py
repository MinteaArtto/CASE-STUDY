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
    "price_dataset_wfp.csv"
)

MODEL_DIR = os.path.join(
    BASE_DIR,
    "wfp_price_models"
)

METRICS_PATH = os.path.join(
    BASE_DIR,
    "wfp_price_model_metrics.csv"
)

FORECAST_PATH = os.path.join(
    BASE_DIR,
    "wfp_price_forecasts.csv"
)

os.makedirs(
    MODEL_DIR,
    exist_ok=True
)


# ============================================================
# CONFIG
# ============================================================

TEST_RATIO = 0.20


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
# PREPARE MONTHLY SERIES
#
# We reindex to true calendar months.
#
# Important:
# Missing months remain NaN.
# We DO NOT fabricate or interpolate missing prices.
# ============================================================

def prepare_monthly_series(
    commodity_df
):

    temp = commodity_df[
        [
            "date",
            "monthly_average_price"
        ]
    ].copy()

    temp = temp.sort_values(
        "date"
    )

    temp = temp.drop_duplicates(
        subset=["date"],
        keep="first"
    )

    temp = temp.set_index(
        "date"
    )

    # The WFP observations use the 15th.
    # Convert every observation into a monthly period.
    temp.index = (
        temp.index
        .to_period("M")
    )

    # One value per month.
    temp = temp[
        ~temp.index.duplicated(
            keep="first"
        )
    ]

    # Create complete monthly calendar.
    full_months = pd.period_range(
        start=temp.index.min(),
        end=temp.index.max(),
        freq="M"
    )

    temp = temp.reindex(
        full_months
    )

    temp.index.name = "month"

    return temp


# ============================================================
# CREATE TRAINING FEATURES
# ============================================================

def create_training_features(
    monthly
):

    df = monthly.copy()

    # --------------------------------------------------------
    # PRICE LAGS
    # --------------------------------------------------------

    df["lag_1"] = (
        df["monthly_average_price"]
        .shift(1)
    )

    df["lag_2"] = (
        df["monthly_average_price"]
        .shift(2)
    )

    df["lag_3"] = (
        df["monthly_average_price"]
        .shift(3)
    )

    # --------------------------------------------------------
    # ROLLING AVERAGE
    #
    # Uses only previous months.
    # --------------------------------------------------------

    df["rolling_mean_3"] = (
        df["monthly_average_price"]
        .shift(1)
        .rolling(
            window=3,
            min_periods=3
        )
        .mean()
    )

    # --------------------------------------------------------
    # TIME FEATURES
    # --------------------------------------------------------

    df["month_number"] = [
        period.month
        for period in df.index
    ]

    df["year"] = [
        period.year
        for period in df.index
    ]

    first_year = min(
        df["year"]
    )

    df["trend"] = (
        (
            df["year"]
            - first_year
        )
        * 12
        + df["month_number"]
    )

    # --------------------------------------------------------
    # SEASONAL FEATURES
    # --------------------------------------------------------

    df["month_sin"] = np.sin(
        2
        * np.pi
        * df["month_number"]
        / 12
    )

    df["month_cos"] = np.cos(
        2
        * np.pi
        * df["month_number"]
        / 12
    )

    return df


# ============================================================
# FEATURES USED BY MODEL
# ============================================================

FEATURE_COLUMNS = [
    "lag_1",
    "lag_2",
    "lag_3",
    "rolling_mean_3",
    "trend",
    "month_sin",
    "month_cos",
]


# ============================================================
# BUILD FEATURES FOR FUTURE MONTH
# ============================================================

def build_future_features(
    price_history,
    target_period,
    origin_year
):

    # Need last 3 known/predicted prices.
    if len(price_history) < 3:
        return None

    lag_1 = price_history[-1]
    lag_2 = price_history[-2]
    lag_3 = price_history[-3]

    rolling_mean_3 = np.mean(
        [
            lag_1,
            lag_2,
            lag_3
        ]
    )

    month_number = (
        target_period.month
    )

    trend = (
        (
            target_period.year
            - origin_year
        )
        * 12
        + month_number
    )

    month_sin = np.sin(
        2
        * np.pi
        * month_number
        / 12
    )

    month_cos = np.cos(
        2
        * np.pi
        * month_number
        / 12
    )

    return pd.DataFrame(
        [
            {
                "lag_1":
                    lag_1,

                "lag_2":
                    lag_2,

                "lag_3":
                    lag_3,

                "rolling_mean_3":
                    rolling_mean_3,

                "trend":
                    trend,

                "month_sin":
                    month_sin,

                "month_cos":
                    month_cos,
            }
        ]
    )


# ============================================================
# RECURSIVE FORECAST
#
# month 1:
# actual history -> predicted month 1
#
# month 2:
# includes predicted month 1
#
# month 3:
# includes predicted month 1 + month 2
# ============================================================

def forecast_future(
    model,
    recent_prices,
    latest_period,
    origin_year,
    months_ahead
):

    history = list(
        recent_prices
    )

    forecasts = []

    current_period = (
        latest_period
    )

    for step in range(
        1,
        months_ahead + 1
    ):

        target_period = (
            current_period + step
        )

        features = (
            build_future_features(
                history,
                target_period,
                origin_year
            )
        )

        if features is None:
            return []

        prediction = float(
            model.predict(
                features[
                    FEATURE_COLUMNS
                ]
            )[0]
        )

        # Prevent impossible negative price.
        prediction = max(
            prediction,
            0
        )

        forecasts.append({
            "period":
                target_period,

            "price":
                prediction,
        })

        history.append(
            prediction
        )

    return forecasts


# ============================================================
# DIRECTION
# ============================================================

def get_direction(
    current_price,
    forecast_price
):

    difference = (
        forecast_price
        - current_price
    )

    if abs(difference) < 0.50:
        return "stable"

    if difference > 0:
        return "increase"

    return "decrease"


# ============================================================
# LOAD DATA
# ============================================================

print()
print("=" * 80)
print("WFP MONTHLY PRICE REGRESSION TRAINING")
print("=" * 80)

print(
    f"\nDataset:\n{DATASET_PATH}"
)


df = pd.read_csv(
    DATASET_PATH
)


df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)


df[
    "monthly_average_price"
] = pd.to_numeric(
    df["monthly_average_price"],
    errors="coerce"
)


df = df.dropna(
    subset=[
        "date",
        "commodity",
        "monthly_average_price",
    ]
)


df = df[
    df[
        "monthly_average_price"
    ] > 0
]


print(
    f"\nRecords loaded : "
    f"{len(df)}"
)

print(
    f"Commodities    : "
    f"{df['commodity'].nunique()}"
)


# ============================================================
# RESULTS
# ============================================================

metric_results = []

forecast_results = []


# ============================================================
# TRAIN EACH COMMODITY
# ============================================================

for commodity in sorted(
    df["commodity"].unique()
):

    print()
    print("=" * 80)
    print(commodity)
    print("=" * 80)

    commodity_df = df[
        df["commodity"]
        == commodity
    ].copy()

    monthly = prepare_monthly_series(
        commodity_df
    )

    feature_df = (
        create_training_features(
            monthly
        )
    )

    # ========================================================
    # REMOVE ROWS WITH MISSING ACTUAL OR FEATURES
    #
    # Missing months are NOT interpolated.
    # ========================================================

    model_df = feature_df.dropna(
        subset=(
            FEATURE_COLUMNS
            + [
                "monthly_average_price"
            ]
        )
    ).copy()


    total_observations = len(
        model_df
    )


    print(
        f"Usable model rows : "
        f"{total_observations}"
    )


    if total_observations < 15:

        print(
            "Skipped: not enough "
            "continuous monthly observations."
        )

        continue


    X = model_df[
        FEATURE_COLUMNS
    ]


    y = model_df[
        "monthly_average_price"
    ]


    # ========================================================
    # CHRONOLOGICAL TRAIN / TEST SPLIT
    # ========================================================

    split_index = int(
        len(model_df)
        * (
            1
            - TEST_RATIO
        )
    )


    split_index = min(
        split_index,
        len(model_df) - 2
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
    # EVALUATION MODEL
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


    r2 = r2_score(
        y_test,
        test_predictions
    )


    # ========================================================
    # NAIVE BASELINE
    #
    # Predict next month using previous month's actual price.
    #
    # This gives us something to compare regression against.
    # ========================================================

    naive_predictions = (
        model_df[
            "lag_1"
        ]
        .iloc[
            split_index:
        ]
    )


    naive_mae = (
        mean_absolute_error(
            y_test,
            naive_predictions
        )
    )


    print(
        f"Training rows   : "
        f"{len(X_train)}"
    )

    print(
        f"Testing rows    : "
        f"{len(X_test)}"
    )

    print(
        f"Regression MAE  : "
        f"{mae:.2f}"
    )

    print(
        f"Regression RMSE : "
        f"{rmse:.2f}"
    )

    print(
        f"Regression R²   : "
        f"{r2:.4f}"
    )

    print(
        f"Naive MAE       : "
        f"{naive_mae:.2f}"
    )


    # ========================================================
    # FINAL MODEL
    #
    # Retrain using all available model rows.
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

        "features":
            FEATURE_COLUMNS,

        "origin_year":
            int(
                min(
                    feature_df["year"]
                )
            ),

        "mae":
            mae,

        "rmse":
            rmse,

        "r2":
            r2,

        "naive_mae":
            naive_mae,
    }


    joblib.dump(
        model_package,
        model_path
    )


    # ========================================================
    # LATEST ACTUAL OBSERVATIONS
    # ========================================================

    actual_monthly = monthly[
        "monthly_average_price"
    ].dropna()


    latest_period = (
        actual_monthly.index[-1]
    )


    latest_price = float(
        actual_monthly.iloc[-1]
    )


    # Need the latest three actual monthly values.
    recent_prices = (
        actual_monthly
        .iloc[-3:]
        .tolist()
    )


    # ========================================================
    # GENERATE 3 MONTHS
    # ========================================================

    forecasts = (
        forecast_future(
            final_model,
            recent_prices,
            latest_period,
            model_package[
                "origin_year"
            ],
            months_ahead=3
        )
    )


    if len(forecasts) < 3:

        print(
            "Could not generate forecasts."
        )

        continue


    one_month = (
        forecasts[0]
    )


    three_month = (
        forecasts[2]
    )


    print()

    print(
        f"Latest recorded : "
        f"₱{latest_price:.2f}/kg"
    )

    print(
        f"Latest month    : "
        f"{latest_period}"
    )

    print()

    print(
        f"1 Month Forecast: "
        f"₱{one_month['price']:.2f}/kg "
        f"("
        f"{get_direction(latest_price, one_month['price'])}"
        f")"
    )


    print(
        f"3 Month Forecast: "
        f"₱{three_month['price']:.2f}/kg "
        f"("
        f"{get_direction(latest_price, three_month['price'])}"
        f")"
    )


    # ========================================================
    # METRICS OUTPUT
    # ========================================================

    metric_results.append({

        "commodity":
            commodity,

        "usable_rows":
            total_observations,

        "training_rows":
            len(X_train),

        "testing_rows":
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
            ),

        "naive_mae":
            round(
                naive_mae,
                4
            ),

        "beats_naive":
            mae < naive_mae,
    })


    # ========================================================
    # FORECAST OUTPUT
    # ========================================================

    forecast_results.append({

        "commodity":
            commodity,

        "latest_month":
            str(
                latest_period
            ),

        "latest_recorded_price":
            round(
                latest_price,
                2
            ),

        "one_month_period":
            str(
                one_month[
                    "period"
                ]
            ),

        "one_month_forecast":
            round(
                one_month[
                    "price"
                ],
                2
            ),

        "one_month_direction":
            get_direction(
                latest_price,
                one_month[
                    "price"
                ]
            ),

        "three_month_period":
            str(
                three_month[
                    "period"
                ]
            ),

        "three_month_forecast":
            round(
                three_month[
                    "price"
                ],
                2
            ),

        "three_month_direction":
            get_direction(
                latest_price,
                three_month[
                    "price"
                ]
            ),
    })


# ============================================================
# SAVE RESULTS
# ============================================================

metrics_df = pd.DataFrame(
    metric_results
)


metrics_df.to_csv(
    METRICS_PATH,
    index=False,
    encoding="utf-8-sig"
)


forecast_df = pd.DataFrame(
    forecast_results
)


forecast_df.to_csv(
    FORECAST_PATH,
    index=False,
    encoding="utf-8-sig"
)


# ============================================================
# OVERALL RESULTS
# ============================================================

print()
print("=" * 80)
print("OVERALL WFP MODEL RESULTS")
print("=" * 80)


if not metrics_df.empty:

    print(
        f"Models trained       : "
        f"{len(metrics_df)}"
    )

    print(
        f"Average MAE          : "
        f"{metrics_df['mae'].mean():.2f}"
    )

    print(
        f"Average RMSE         : "
        f"{metrics_df['rmse'].mean():.2f}"
    )

    print(
        f"Average R²           : "
        f"{metrics_df['r2'].mean():.4f}"
    )

    print(
        f"Models beating naive : "
        f"{metrics_df['beats_naive'].sum()}"
        f"/"
        f"{len(metrics_df)}"
    )


print()
print("=" * 80)
print("TRAINING COMPLETE")
print("=" * 80)

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