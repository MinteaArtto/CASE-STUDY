import os
import json
import math
import shutil
import sys
import joblib
import tempfile
from datetime import datetime

import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder



# ============================================================
# UTF-8 CONSOLE OUTPUT
# ============================================================

def configure_utf8_console():
    """
    Force UTF-8 for stdout/stderr when supported.

    This prevents Windows CP1252 console errors when printing
    characters such as the peso sign (₱) and R-squared symbol (²),
    especially when this script is launched as a child process
    from the Node.js backend.
    """

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)

        if stream is None:
            continue

        reconfigure = getattr(stream, "reconfigure", None)

        if callable(reconfigure):
            try:
                reconfigure(
                    encoding="utf-8",
                    errors="replace",
                )
            except (OSError, ValueError):
                pass


configure_utf8_console()


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
    "da_weekly_model_final.csv",
)

MODEL_DIR = os.path.join(
    BASE_DIR,
    "price_models",
)

METRICS_PATH = os.path.join(
    BASE_DIR,
    "price_model_metrics.csv",
)

PREDICTIONS_PATH = os.path.join(
    BASE_DIR,
    "price_model_test_predictions.csv",
)

METADATA_PATH = os.path.join(
    MODEL_DIR,
    "price_model_metadata.json",
)

BACKUP_ROOT = os.path.join(
    BASE_DIR,
    "price_model_backups",
)

os.makedirs(
    MODEL_DIR,
    exist_ok=True,
)

os.makedirs(
    BACKUP_ROOT,
    exist_ok=True,
)


# ============================================================
# MODEL CONFIGURATION
# ============================================================

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

CATEGORICAL_FEATURES = [
    "series_key",
]

MODEL_FEATURES = (
    CATEGORICAL_FEATURES
    + NUMERIC_FEATURES
)


# ============================================================
# SOURCE DATA PREPARATION
# ============================================================

def prepare_source_data(df):
    required = [
        "week_start",
        "weekly_average_price",
    ]

    missing = [
        column
        for column in required
        if column not in df.columns
    ]

    if missing:
        raise ValueError(
            "Missing required columns: "
            + ", ".join(missing)
        )

    df = df.copy()

    df["week_start"] = pd.to_datetime(
        df["week_start"],
        errors="coerce",
    )

    df["weekly_average_price"] = pd.to_numeric(
        df["weekly_average_price"],
        errors="coerce",
    )

    # --------------------------------------------------------
    # Only numeric positive prices can be used for regression.
    #
    # Unavailable prices remain in the canonical CSV itself,
    # but they cannot be used as numeric model observations.
    # --------------------------------------------------------

    df = df.dropna(
        subset=[
            "week_start",
            "weekly_average_price",
        ]
    )

    df = df[
        df["weekly_average_price"] > 0
    ].copy()

    # --------------------------------------------------------
    # series_key should normally already exist.
    #
    # This fallback is retained for safety in case a compatible
    # normalized dataset without series_key is ever supplied.
    # --------------------------------------------------------

    if "series_key" not in df.columns:
        needed = [
            "category_normalized",
            "commodity_normalized",
            "specification_normalized",
            "unit",
        ]

        missing = [
            column
            for column in needed
            if column not in df.columns
        ]

        if missing:
            raise ValueError(
                "series_key is missing and cannot be rebuilt. "
                "Missing: "
                + ", ".join(missing)
            )

        df["series_key"] = (
            df["category_normalized"]
            .fillna("")
            .astype(str)
            .str.strip()
            + " | "
            + df["commodity_normalized"]
            .fillna("")
            .astype(str)
            .str.strip()
            + " | "
            + df["specification_normalized"]
            .fillna("")
            .astype(str)
            .str.strip()
            + " | "
            + df["unit"]
            .fillna("")
            .astype(str)
            .str.strip()
        )

    # --------------------------------------------------------
    # Prevent more than one numeric observation for the same
    # series in the same reporting week.
    # --------------------------------------------------------

    return (
        df.sort_values(
            [
                "series_key",
                "week_start",
            ]
        )
        .drop_duplicates(
            [
                "series_key",
                "week_start",
            ],
            keep="last",
        )
        .reset_index(drop=True)
    )


# ============================================================
# FEATURE DATASET
# ============================================================

def build_feature_dataset(df):
    all_weeks = sorted(
        pd.to_datetime(
            df["week_start"].unique()
        )
    )

    week_position = {
        pd.Timestamp(week): index
        for index, week
        in enumerate(all_weeks)
    }

    feature_rows = []

    for (
        series_key,
        group,
    ) in df.groupby(
        "series_key"
    ):
        group = (
            group
            .sort_values("week_start")
            .set_index("week_start")
        )

        if (
            len(group)
            < MIN_SERIES_OBSERVATIONS
        ):
            continue

        for (
            current_week,
            row,
        ) in group.iterrows():

            current_week = pd.Timestamp(
                current_week
            )

            current_index = (
                week_position[
                    current_week
                ]
            )

            if current_index < 4:
                continue

            previous_weeks = [
                pd.Timestamp(
                    all_weeks[
                        current_index - 1
                    ]
                ),
                pd.Timestamp(
                    all_weeks[
                        current_index - 2
                    ]
                ),
                pd.Timestamp(
                    all_weeks[
                        current_index - 3
                    ]
                ),
                pd.Timestamp(
                    all_weeks[
                        current_index - 4
                    ]
                ),
            ]

            # ------------------------------------------------
            # Require the previous four actual reporting weeks.
            #
            # We do not silently fill missing prices because
            # doing so would fabricate historical observations.
            # ------------------------------------------------

            if not all(
                week in group.index
                for week in previous_weeks
            ):
                continue

            current_price = float(
                row[
                    "weekly_average_price"
                ]
            )

            lag_1 = float(
                group.loc[
                    previous_weeks[0],
                    "weekly_average_price",
                ]
            )

            lag_2 = float(
                group.loc[
                    previous_weeks[1],
                    "weekly_average_price",
                ]
            )

            lag_3 = float(
                group.loc[
                    previous_weeks[2],
                    "weekly_average_price",
                ]
            )

            lag_4 = float(
                group.loc[
                    previous_weeks[3],
                    "weekly_average_price",
                ]
            )

            previous_4week_mean = np.mean(
                [
                    lag_1,
                    lag_2,
                    lag_3,
                    lag_4,
                ]
            )

            result = {
                "week_start":
                    current_week,

                "series_key":
                    series_key,

                "current_price":
                    current_price,

                "change_1w":
                    current_price
                    - lag_1,

                "change_prev":
                    lag_1
                    - lag_2,

                "change_4w":
                    current_price
                    - lag_4,

                "deviation_from_4w_mean":
                    current_price
                    - previous_4week_mean,

                "week_of_year":
                    int(
                        current_week
                        .isocalendar()
                        .week
                    ),
            }

            # ------------------------------------------------
            # Keep display information in evaluation outputs.
            # ------------------------------------------------

            for (
                source_col,
                output_col,
            ) in [
                (
                    "category_normalized",
                    "category",
                ),
                (
                    "commodity_normalized",
                    "commodity",
                ),
                (
                    "specification_normalized",
                    "specification",
                ),
                (
                    "unit",
                    "unit",
                ),
            ]:
                if source_col in row.index:
                    result[
                        output_col
                    ] = row[
                        source_col
                    ]

            # ------------------------------------------------
            # Build future targets for each horizon.
            # ------------------------------------------------

            for (
                horizon_name,
                horizon_weeks,
            ) in FORECAST_HORIZONS.items():

                target_col = (
                    f"target_price_"
                    f"{horizon_name}"
                )

                future_index = (
                    current_index
                    + horizon_weeks
                )

                if future_index >= len(
                    all_weeks
                ):
                    result[
                        target_col
                    ] = np.nan

                    continue

                future_week = pd.Timestamp(
                    all_weeks[
                        future_index
                    ]
                )

                if (
                    future_week
                    not in group.index
                ):
                    result[
                        target_col
                    ] = np.nan

                    continue

                result[
                    target_col
                ] = float(
                    group.loc[
                        future_week,
                        "weekly_average_price",
                    ]
                )

            feature_rows.append(
                result
            )

    features = pd.DataFrame(
        feature_rows
    )

    if features.empty:
        raise ValueError(
            "No usable feature rows were created. "
            "Check weekly coverage and data."
        )

    return (
        features
        .sort_values(
            [
                "week_start",
                "series_key",
            ]
        )
        .reset_index(
            drop=True
        )
    )


# ============================================================
# MODEL CREATION
# ============================================================

def create_model():
    preprocessing = ColumnTransformer(
        transformers=[
            (
                "series",
                OneHotEncoder(
                    handle_unknown="ignore"
                ),
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
            (
                "preprocess",
                preprocessing,
            ),
            (
                "regression",
                LinearRegression(),
            ),
        ]
    )


# ============================================================
# CHRONOLOGICAL SPLIT
# ============================================================

def chronological_split(data):
    unique_weeks = np.array(
        sorted(
            data[
                "week_start"
            ].unique()
        )
    )

    if len(unique_weeks) < 2:
        raise ValueError(
            "Not enough unique reporting weeks "
            "for chronological evaluation."
        )

    split_index = int(
        len(unique_weeks)
        * (
            1
            - TEST_RATIO
        )
    )

    split_index = max(
        1,
        min(
            split_index,
            len(unique_weeks) - 1,
        ),
    )

    cutoff_week = pd.Timestamp(
        unique_weeks[
            split_index
        ]
    )

    train = data[
        data[
            "week_start"
        ] < cutoff_week
    ].copy()

    test = data[
        data[
            "week_start"
        ] >= cutoff_week
    ].copy()

    return (
        train,
        test,
        cutoff_week,
    )


# ============================================================
# HORIZON EVALUATION
# ============================================================

def evaluate_horizon(
    features,
    horizon_name,
):
    target_col = (
        f"target_price_"
        f"{horizon_name}"
    )

    data = (
        features
        .dropna(
            subset=[
                target_col,
            ]
        )
        .copy()
    )

    if data.empty:
        raise ValueError(
            f"No usable target data "
            f"for {horizon_name}."
        )

    # --------------------------------------------------------
    # Predict future CHANGE rather than raw future price.
    # --------------------------------------------------------

    data[
        "target_change"
    ] = (
        data[
            target_col
        ]
        - data[
            "current_price"
        ]
    )

    (
        train,
        test,
        cutoff_week,
    ) = chronological_split(
        data
    )

    if (
        train.empty
        or test.empty
    ):
        raise ValueError(
            f"Not enough data to evaluate "
            f"{horizon_name}."
        )

    evaluation_model = (
        create_model()
    )

    evaluation_model.fit(
        train[
            MODEL_FEATURES
        ],
        train[
            "target_change"
        ],
    )

    predicted_change = (
        evaluation_model.predict(
            test[
                MODEL_FEATURES
            ]
        )
    )

    predicted_price = (
        test[
            "current_price"
        ].to_numpy(
            float
        )
        + predicted_change
    )

    actual_price = (
        test[
            target_col
        ].to_numpy(
            float
        )
    )

    # --------------------------------------------------------
    # Persistence baseline:
    #
    # future price = current price
    # --------------------------------------------------------

    baseline_price = (
        test[
            "current_price"
        ].to_numpy(
            float
        )
    )

    mae = mean_absolute_error(
        actual_price,
        predicted_price,
    )

    rmse = math.sqrt(
        mean_squared_error(
            actual_price,
            predicted_price,
        )
    )

    r2 = r2_score(
        actual_price,
        predicted_price,
    )

    baseline_mae = (
        mean_absolute_error(
            actual_price,
            baseline_price,
        )
    )

    baseline_rmse = math.sqrt(
        mean_squared_error(
            actual_price,
            baseline_price,
        )
    )

    baseline_r2 = r2_score(
        actual_price,
        baseline_price,
    )

    predictions = test[
        [
            "week_start",
            "series_key",
            "current_price",
            target_col,
        ]
    ].copy()

    for column in [
        "category",
        "commodity",
        "specification",
        "unit",
    ]:
        if column in test.columns:
            predictions[
                column
            ] = (
                test[
                    column
                ].values
            )

    predictions[
        "horizon"
    ] = horizon_name

    predictions[
        "actual_future_price"
    ] = actual_price

    predictions[
        "predicted_change"
    ] = predicted_change

    predictions[
        "predicted_price"
    ] = predicted_price

    predictions[
        "baseline_prediction"
    ] = baseline_price

    predictions[
        "absolute_error"
    ] = np.abs(
        actual_price
        - predicted_price
    )

    predictions[
        "baseline_absolute_error"
    ] = np.abs(
        actual_price
        - baseline_price
    )

    metrics = {
        "horizon":
            horizon_name,

        "cutoff_week":
            cutoff_week
            .date()
            .isoformat(),

        "training_records":
            len(train),

        "testing_records":
            len(test),

        "mae":
            mae,

        "rmse":
            rmse,

        "r2":
            r2,

        "baseline_mae":
            baseline_mae,

        "baseline_rmse":
            baseline_rmse,

        "baseline_r2":
            baseline_r2,

        "beats_baseline_mae":
            mae
            < baseline_mae,
    }

    return (
        metrics,
        predictions,
        data,
    )


# ============================================================
# TRAIN FINAL MODEL INTO STAGING
# ============================================================

def train_final_model(
    data,
    horizon_name,
    staging_model_dir,
):
    model = create_model()

    model.fit(
        data[
            MODEL_FEATURES
        ],
        data[
            "target_change"
        ],
    )

    model_package = {
        "model":
            model,

        "horizon":
            horizon_name,

        "features":
            MODEL_FEATURES,

        "numeric_features":
            NUMERIC_FEATURES,

        "categorical_features":
            CATEGORICAL_FEATURES,

        "target":
            "future_price_change",

        "forecast_formula":
            (
                "current_price "
                "+ predicted_change"
            ),

        "minimum_series_observations":
            MIN_SERIES_OBSERVATIONS,

        "training_records":
            len(data),

        "trained_at":
            datetime.now()
            .isoformat(
                timespec="seconds"
            ),
    }

    model_path = os.path.join(
        staging_model_dir,
        (
            f"price_model_"
            f"{horizon_name}.joblib"
        ),
    )

    joblib.dump(
        model_package,
        model_path,
    )

    return model_path


# ============================================================
# VALIDATE STAGED ARTIFACTS
# ============================================================

def validate_staged_artifacts(
    staging_model_dir,
    staging_metrics_path,
    staging_predictions_path,
    staging_metadata_path,
):
    print()
    print(
        "Validating staged model artifacts..."
    )

    expected_horizons = set(
        FORECAST_HORIZONS.keys()
    )

    # --------------------------------------------------------
    # VALIDATE EACH MODEL PACKAGE
    # --------------------------------------------------------

    for horizon_name in (
        FORECAST_HORIZONS
    ):
        model_path = os.path.join(
            staging_model_dir,
            (
                f"price_model_"
                f"{horizon_name}.joblib"
            ),
        )

        if not os.path.isfile(
            model_path
        ):
            raise FileNotFoundError(
                "Staged model was not created: "
                + model_path
            )

        package = joblib.load(
            model_path
        )

        if not isinstance(
            package,
            dict,
        ):
            raise ValueError(
                "Invalid staged model package "
                f"for {horizon_name}."
            )

        if "model" not in package:
            raise ValueError(
                "Staged model package for "
                f"{horizon_name} "
                "has no model."
            )

        if (
            package.get(
                "horizon"
            )
            != horizon_name
        ):
            raise ValueError(
                "Staged model horizon mismatch "
                f"for {horizon_name}."
            )

        model = package[
            "model"
        ]

        if not hasattr(
            model,
            "predict",
        ):
            raise ValueError(
                "Staged model for "
                f"{horizon_name} "
                "cannot predict."
            )

    # --------------------------------------------------------
    # VALIDATE METRICS
    # --------------------------------------------------------

    if not os.path.isfile(
        staging_metrics_path
    ):
        raise FileNotFoundError(
            "Staged metrics file "
            "was not created."
        )

    metrics_df = pd.read_csv(
        staging_metrics_path
    )

    if "horizon" not in (
        metrics_df.columns
    ):
        raise ValueError(
            "Staged metrics file "
            "has no horizon column."
        )

    actual_horizons = set(
        metrics_df[
            "horizon"
        ]
        .astype(str)
        .tolist()
    )

    if (
        actual_horizons
        != expected_horizons
    ):
        raise ValueError(
            "Staged metrics do not contain "
            "exactly 1w, 2w, and 4w."
        )

    # --------------------------------------------------------
    # VALIDATE TEST PREDICTIONS
    # --------------------------------------------------------

    if not os.path.isfile(
        staging_predictions_path
    ):
        raise FileNotFoundError(
            "Staged predictions file "
            "was not created."
        )

    predictions_df = pd.read_csv(
        staging_predictions_path
    )

    if predictions_df.empty:
        raise ValueError(
            "Staged prediction file "
            "is empty."
        )

    if "horizon" not in (
        predictions_df.columns
    ):
        raise ValueError(
            "Staged prediction file "
            "has no horizon column."
        )

    prediction_horizons = set(
        predictions_df[
            "horizon"
        ]
        .astype(str)
        .tolist()
    )

    if (
        prediction_horizons
        != expected_horizons
    ):
        raise ValueError(
            "Staged prediction file does not "
            "contain all forecast horizons."
        )

    # --------------------------------------------------------
    # VALIDATE METADATA
    # --------------------------------------------------------

    if not os.path.isfile(
        staging_metadata_path
    ):
        raise FileNotFoundError(
            "Staged metadata file "
            "was not created."
        )

    with open(
        staging_metadata_path,
        "r",
        encoding="utf-8",
    ) as file:
        metadata = json.load(
            file
        )

    if (
        metadata.get(
            "model_type"
        )
        != "LinearRegression"
    ):
        raise ValueError(
            "Unexpected model type "
            "in staged metadata."
        )

    if (
        metadata.get(
            "horizons"
        )
        != FORECAST_HORIZONS
    ):
        raise ValueError(
            "Staged metadata horizon "
            "configuration is invalid."
        )

    print(
        "Staged model artifacts "
        "passed validation."
    )


# ============================================================
# LIVE ARTIFACT PATHS
# ============================================================

def get_live_artifacts():
    return {
        "price_model_1w.joblib":
            os.path.join(
                MODEL_DIR,
                "price_model_1w.joblib",
            ),

        "price_model_2w.joblib":
            os.path.join(
                MODEL_DIR,
                "price_model_2w.joblib",
            ),

        "price_model_4w.joblib":
            os.path.join(
                MODEL_DIR,
                "price_model_4w.joblib",
            ),

        "price_model_metadata.json":
            METADATA_PATH,

        "price_model_metrics.csv":
            METRICS_PATH,

        "price_model_test_predictions.csv":
            PREDICTIONS_PATH,
    }


# ============================================================
# STAGED ARTIFACT PATHS
# ============================================================

def get_staged_artifacts(
    staging_model_dir,
    staging_metrics_path,
    staging_predictions_path,
    staging_metadata_path,
):
    return {
        "price_model_1w.joblib":
            os.path.join(
                staging_model_dir,
                "price_model_1w.joblib",
            ),

        "price_model_2w.joblib":
            os.path.join(
                staging_model_dir,
                "price_model_2w.joblib",
            ),

        "price_model_4w.joblib":
            os.path.join(
                staging_model_dir,
                "price_model_4w.joblib",
            ),

        "price_model_metadata.json":
            staging_metadata_path,

        "price_model_metrics.csv":
            staging_metrics_path,

        "price_model_test_predictions.csv":
            staging_predictions_path,
    }


# ============================================================
# BACKUP LIVE ARTIFACTS
# ============================================================

def create_live_backup(
    live_artifacts,
):
    timestamp = (
        datetime.now()
        .strftime(
            "%Y%m%d_%H%M%S"
        )
    )

    backup_dir = os.path.join(
        BACKUP_ROOT,
        timestamp,
    )

    counter = 1

    while os.path.exists(
        backup_dir
    ):
        backup_dir = os.path.join(
            BACKUP_ROOT,
            (
                f"{timestamp}_"
                f"{counter}"
            ),
        )

        counter += 1

    os.makedirs(
        backup_dir,
        exist_ok=False,
    )

    backed_up = []

    for (
        artifact_name,
        live_path,
    ) in live_artifacts.items():

        if not os.path.isfile(
            live_path
        ):
            continue

        backup_path = os.path.join(
            backup_dir,
            artifact_name,
        )

        shutil.copy2(
            live_path,
            backup_path,
        )

        backed_up.append(
            artifact_name
        )

    return (
        backup_dir,
        backed_up,
    )


# ============================================================
# SAFE SAME-DRIVE REPLACEMENT
# ============================================================

def copy_then_replace(
    source_path,
    destination_path,
):
    """
    Staging may exist on C: while the project lives on D:.

    os.replace() cannot move directly across Windows drives.

    Therefore:
    1. Copy the complete staged file beside the live file.
    2. Atomically replace the live file from the temporary file
       on the SAME drive.
    """

    destination_directory = (
        os.path.dirname(
            destination_path
        )
    )

    os.makedirs(
        destination_directory,
        exist_ok=True,
    )

    temporary_destination = (
        destination_path
        + ".new"
    )

    if os.path.exists(
        temporary_destination
    ):
        os.remove(
            temporary_destination
        )

    try:
        shutil.copy2(
            source_path,
            temporary_destination,
        )

        # ----------------------------------------------------
        # Basic copy validation before replacing the live file.
        # ----------------------------------------------------

        if not os.path.isfile(
            temporary_destination
        ):
            raise RuntimeError(
                "Temporary copied artifact "
                "was not created."
            )

        source_size = os.path.getsize(
            source_path
        )

        copied_size = os.path.getsize(
            temporary_destination
        )

        if (
            source_size
            != copied_size
        ):
            raise RuntimeError(
                "Copied artifact size does not "
                "match staged artifact size."
            )

        # ----------------------------------------------------
        # Both paths are now on the project drive, so
        # os.replace() can safely perform the replacement.
        # ----------------------------------------------------

        os.replace(
            temporary_destination,
            destination_path,
        )

    finally:
        if os.path.exists(
            temporary_destination
        ):
            try:
                os.remove(
                    temporary_destination
                )
            except OSError:
                pass


# ============================================================
# ACTIVATE STAGED ARTIFACTS
# ============================================================

def activate_staged_artifacts(
    staged_artifacts,
    live_artifacts,
):
    """
    Activate the new model set only after all staged files have
    trained and passed validation.

    Existing live artifacts are backed up first.

    If any replacement fails, the previous live artifacts are
    restored from the backup.
    """

    backup_dir = None

    live_existed_before = {
        artifact_name:
            os.path.exists(
                live_path
            )

        for (
            artifact_name,
            live_path,
        ) in (
            live_artifacts.items()
        )
    }

    try:
        (
            backup_dir,
            backed_up,
        ) = create_live_backup(
            live_artifacts
        )

        print()
        print(
            "Live model backup created:"
        )

        print(
            backup_dir
        )

        if backed_up:
            print(
                f"Artifacts backed up: "
                f"{len(backed_up)}"
            )
        else:
            print(
                "No previous live artifacts "
                "were present to back up."
            )

        # ----------------------------------------------------
        # ACTIVATE ALL STAGED ARTIFACTS
        # ----------------------------------------------------

        for (
            artifact_name,
            staged_path,
        ) in staged_artifacts.items():

            if not os.path.isfile(
                staged_path
            ):
                raise FileNotFoundError(
                    "Staged artifact disappeared "
                    "before activation: "
                    + staged_path
                )

            live_path = (
                live_artifacts[
                    artifact_name
                ]
            )

            copy_then_replace(
                staged_path,
                live_path,
            )

        print()
        print(
            "New model artifacts activated."
        )

        return backup_dir

    except Exception:
        print()
        print(
            "Model activation failed."
        )

        print(
            "Restoring previous live artifacts..."
        )

        if backup_dir:
            for (
                artifact_name,
                live_path,
            ) in live_artifacts.items():

                backup_path = os.path.join(
                    backup_dir,
                    artifact_name,
                )

                if os.path.isfile(
                    backup_path
                ):
                    shutil.copy2(
                        backup_path,
                        live_path,
                    )

                elif (
                    not live_existed_before[
                        artifact_name
                    ]
                    and os.path.exists(
                        live_path
                    )
                ):
                    os.remove(
                        live_path
                    )

        print(
            "Previous live artifacts restored."
        )

        raise


# ============================================================
# VERIFY ACTIVATED LIVE MODELS
# ============================================================

def verify_live_models():
    print()
    print(
        "Verifying activated live models..."
    )

    for horizon_name in (
        FORECAST_HORIZONS
    ):
        live_model_path = os.path.join(
            MODEL_DIR,
            (
                f"price_model_"
                f"{horizon_name}.joblib"
            ),
        )

        if not os.path.isfile(
            live_model_path
        ):
            raise RuntimeError(
                "Activated model file "
                "is missing: "
                + live_model_path
            )

        package = joblib.load(
            live_model_path
        )

        if not isinstance(
            package,
            dict,
        ):
            raise RuntimeError(
                "Activated model package "
                "is invalid: "
                f"{horizon_name}"
            )

        if "model" not in package:
            raise RuntimeError(
                "Activated model package "
                "does not contain model: "
                f"{horizon_name}"
            )

        if (
            package.get(
                "horizon"
            )
            != horizon_name
        ):
            raise RuntimeError(
                "Activated model has wrong "
                "horizon metadata: "
                f"{horizon_name}"
            )

        model = package[
            "model"
        ]

        if not hasattr(
            model,
            "predict",
        ):
            raise RuntimeError(
                "Activated model cannot "
                "perform predictions: "
                f"{horizon_name}"
            )

    if not os.path.isfile(
        METRICS_PATH
    ):
        raise RuntimeError(
            "Activated metrics file "
            "is missing."
        )

    if not os.path.isfile(
        PREDICTIONS_PATH
    ):
        raise RuntimeError(
            "Activated test predictions "
            "file is missing."
        )

    if not os.path.isfile(
        METADATA_PATH
    ):
        raise RuntimeError(
            "Activated metadata file "
            "is missing."
        )

    print(
        "All activated live models "
        "passed verification."
    )


# ============================================================
# MAIN TRAINING PROCESS
# ============================================================

def main():
    print()
    print("=" * 80)

    print(
        "SAFE DA PRICE FORECAST "
        "LINEAR REGRESSION TRAINING"
    )

    print("=" * 80)

    print(
        f"\nDataset:\n"
        f"{DATASET_PATH}"
    )

    if not os.path.exists(
        DATASET_PATH
    ):
        raise FileNotFoundError(
            "\nDataset not found.\n"
            f"Expected:\n"
            f"{DATASET_PATH}\n"
        )

    # --------------------------------------------------------
    # LOAD CURRENT CANONICAL DATA
    # --------------------------------------------------------

    raw_df = pd.read_csv(
        DATASET_PATH
    )

    source_df = (
        prepare_source_data(
            raw_df
        )
    )

    features = (
        build_feature_dataset(
            source_df
        )
    )

    print(
        f"\nSource records   : "
        f"{len(source_df):,}"
    )

    print(
        f"Usable series    : "
        f"{features['series_key'].nunique():,}"
    )

    print(
        f"Feature rows     : "
        f"{len(features):,}"
    )

    metrics_rows = []

    prediction_frames = []

    # --------------------------------------------------------
    # CREATE UNIQUE STAGING DIRECTORY
    # --------------------------------------------------------

    staging_root = (
        tempfile.mkdtemp(
            prefix=(
                "mamav_price_training_"
            )
        )
    )

    staging_model_dir = (
        os.path.join(
            staging_root,
            "price_models",
        )
    )

    os.makedirs(
        staging_model_dir,
        exist_ok=True,
    )

    staging_metrics_path = (
        os.path.join(
            staging_root,
            "price_model_metrics.csv",
        )
    )

    staging_predictions_path = (
        os.path.join(
            staging_root,
            "price_model_test_predictions.csv",
        )
    )

    staging_metadata_path = (
        os.path.join(
            staging_model_dir,
            "price_model_metadata.json",
        )
    )

    print(
        f"\nStaging directory:\n"
        f"{staging_root}"
    )

    try:
        # ----------------------------------------------------
        # TRAIN AND EVALUATE EVERY HORIZON
        # ----------------------------------------------------

        for horizon_name in (
            FORECAST_HORIZONS
        ):
            print()
            print(
                "-" * 80
            )

            print(
                f"HORIZON: "
                f"{horizon_name.upper()}"
            )

            print(
                "-" * 80
            )

            (
                metrics,
                predictions,
                horizon_data,
            ) = evaluate_horizon(
                features,
                horizon_name,
            )

            metrics_rows.append(
                metrics
            )

            prediction_frames.append(
                predictions
            )

            staged_model_path = (
                train_final_model(
                    horizon_data,
                    horizon_name,
                    staging_model_dir,
                )
            )

            print(
                f"Train rows       : "
                f"{metrics['training_records']:,}"
            )

            print(
                f"Test rows        : "
                f"{metrics['testing_records']:,}"
            )

            print(
                f"Cutoff week      : "
                f"{metrics['cutoff_week']}"
            )

            print(
                f"Model MAE        : "
                f"₱{metrics['mae']:.2f}"
            )

            print(
                f"Model RMSE       : "
                f"₱{metrics['rmse']:.2f}"
            )

            print(
                f"Model R²         : "
                f"{metrics['r2']:.4f}"
            )

            print(
                f"Baseline MAE     : "
                f"₱{metrics['baseline_mae']:.2f}"
            )

            print(
                "Beats baseline?  : "
                + (
                    "YES"
                    if metrics[
                        "beats_baseline_mae"
                    ]
                    else "NO"
                )
            )

            print(
                f"Staged model     : "
                f"{os.path.basename(staged_model_path)}"
            )

        # ----------------------------------------------------
        # WRITE STAGED METRICS
        # ----------------------------------------------------

        metrics_df = pd.DataFrame(
            metrics_rows
        )

        metrics_df.to_csv(
            staging_metrics_path,
            index=False,
            encoding="utf-8-sig",
        )

        # ----------------------------------------------------
        # WRITE STAGED TEST PREDICTIONS
        # ----------------------------------------------------

        all_predictions = pd.concat(
            prediction_frames,
            ignore_index=True,
        )

        all_predictions.to_csv(
            staging_predictions_path,
            index=False,
            encoding="utf-8-sig",
        )

        # ----------------------------------------------------
        # WRITE STAGED METADATA
        # ----------------------------------------------------

        metadata = {
            "model_type":
                "LinearRegression",

            "source":
                (
                    "Department of Agriculture "
                    "weekly retail price data"
                ),

            "dataset":
                os.path.basename(
                    DATASET_PATH
                ),

            "features":
                MODEL_FEATURES,

            "target":
                "future_price_change",

            "forecast_formula":
                (
                    "current_price "
                    "+ predicted_change"
                ),

            "horizons":
                FORECAST_HORIZONS,

            "test_ratio":
                TEST_RATIO,

            "split_method":
                (
                    "chronological by unique "
                    "reporting week"
                ),

            "minimum_series_observations":
                MIN_SERIES_OBSERVATIONS,

            "baseline":
                (
                    "future price equals "
                    "current price"
                ),

            "trained_at":
                (
                    datetime.now()
                    .isoformat(
                        timespec="seconds"
                    )
                ),

            "canonical_dataset":
                DATASET_PATH,

            "source_numeric_records":
                len(source_df),

            "usable_series":
                int(
                    features[
                        "series_key"
                    ].nunique()
                ),

            "feature_rows":
                len(features),
        }

        with open(
            staging_metadata_path,
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(
                metadata,
                file,
                indent=2,
            )

        # ----------------------------------------------------
        # VALIDATE EVERYTHING BEFORE TOUCHING LIVE FILES
        # ----------------------------------------------------

        validate_staged_artifacts(
            staging_model_dir,
            staging_metrics_path,
            staging_predictions_path,
            staging_metadata_path,
        )

        # ----------------------------------------------------
        # BUILD ARTIFACT MAPS
        # ----------------------------------------------------

        staged_artifacts = (
            get_staged_artifacts(
                staging_model_dir,
                staging_metrics_path,
                staging_predictions_path,
                staging_metadata_path,
            )
        )

        live_artifacts = (
            get_live_artifacts()
        )

        # ----------------------------------------------------
        # BACK UP CURRENT FILES AND ACTIVATE NEW FILES
        # ----------------------------------------------------

        backup_dir = (
            activate_staged_artifacts(
                staged_artifacts,
                live_artifacts,
            )
        )

        # ----------------------------------------------------
        # FINAL LIVE VERIFICATION
        # ----------------------------------------------------

        verify_live_models()

        # ----------------------------------------------------
        # SUCCESS
        # ----------------------------------------------------

        print()
        print(
            "=" * 80
        )

        print(
            "TRAINING AND MODEL "
            "ACTIVATION COMPLETE"
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
            f"\nTest predictions:\n"
            f"{PREDICTIONS_PATH}"
        )

        print(
            f"\nMetadata:\n"
            f"{METADATA_PATH}"
        )

        print(
            f"\nPrevious model backup:\n"
            f"{backup_dir}"
        )

        print()

    finally:
        # ----------------------------------------------------
        # CLEAN UP STAGING DIRECTORY
        # ----------------------------------------------------

        if os.path.isdir(
            staging_root
        ):
            shutil.rmtree(
                staging_root,
                ignore_errors=True,
            )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    try:
        main()

    except Exception as error:
        print()
        print(
            "=" * 80
        )

        print(
            "PRICE MODEL TRAINING FAILED"
        )

        print(
            "=" * 80
        )

        print(
            str(error)
        )

        print()
        print(
            "The newly trained model set "
            "was not intentionally activated."
        )

        print(
            "=" * 80
        )

        print()

        raise