from __future__ import annotations

import argparse
import csv
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path


# ============================================================
# PATHS
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

PRICE_DATA_DIR = PROJECT_ROOT / "price_data"

CANONICAL_CSV = PRICE_DATA_DIR / "da_weekly_model_final.csv"

CATALOG_CSV = (
    PRICE_DATA_DIR
    / "current_catalog_forecast_eligibility.csv"
)

BACKUP_DIR = PRICE_DATA_DIR / "backups"


# ============================================================
# CONFIGURATION
# ============================================================

FORECAST_MINIMUM_OBSERVATIONS = 16


# ============================================================
# OUTPUT COLUMNS
# ============================================================

OUTPUT_COLUMNS = [
    "index",
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
]


# ============================================================
# TEXT HELPERS
# ============================================================

def clean_text(value) -> str:
    if value is None:
        return ""

    return " ".join(str(value).strip().split())


def display_specification(value) -> str:
    """
    The canonical CSV stores blank specifications as blank.

    series_key may contain:
        (no specification)

    But the catalog specification column should remain blank.
    """

    text = clean_text(value)

    if text.lower() == "(no specification)":
        return ""

    return text


# ============================================================
# PRICE PARSING
# ============================================================

def parse_price(value):
    """
    Returns float for a usable positive numeric price.

    Returns None for blank/unavailable prices.
    """

    if value is None:
        return None

    text = clean_text(value)

    if not text:
        return None

    lowered = text.lower()

    unavailable_values = {
        "",
        "-",
        "—",
        "n/a",
        "na",
        "null",
        "none",
        "unavailable",
        "#div/0!",
    }

    if lowered in unavailable_values:
        return None

    cleaned = (
        text.replace(",", "")
        .replace("₱", "")
        .strip()
    )

    try:
        number = float(cleaned)
    except ValueError:
        return None

    if number <= 0:
        return None

    return number


def format_price(value):
    """
    Produce clean CSV numeric output.

    150.0  -> 150
    441.22 -> 441.22
    None   -> ""
    """

    if value is None:
        return ""

    number = float(value)

    if number.is_integer():
        return str(int(number))

    return (
        f"{number:.10f}"
        .rstrip("0")
        .rstrip(".")
    )


# ============================================================
# CSV LOADING
# ============================================================

def load_canonical_rows():
    if not CANONICAL_CSV.exists():
        raise FileNotFoundError(
            f"Canonical CSV not found:\n{CANONICAL_CSV}"
        )

    with CANONICAL_CSV.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)

        required_columns = {
            "week_start",
            "week_end",
            "category_normalized",
            "commodity_normalized",
            "specification_normalized",
            "unit",
            "weekly_average_price",
            "series_key",
        }

        if not reader.fieldnames:
            raise ValueError(
                "Canonical CSV has no header."
            )

        missing = required_columns - set(
            reader.fieldnames
        )

        if missing:
            raise ValueError(
                "Canonical CSV is missing required "
                f"columns: {', '.join(sorted(missing))}"
            )

        rows = list(reader)

    if not rows:
        raise ValueError(
            "Canonical CSV contains no data rows."
        )

    return rows


# ============================================================
# LATEST WEEK
# ============================================================

def find_latest_week(rows):
    week_starts = [
        clean_text(row.get("week_start"))
        for row in rows
        if clean_text(row.get("week_start"))
    ]

    if not week_starts:
        raise ValueError(
            "No week_start values were found."
        )

    # ISO YYYY-MM-DD dates sort correctly as strings.
    return max(week_starts)


# ============================================================
# CURRENT CATALOG
# ============================================================

def load_existing_catalog():
    """
    Load the already-approved current catalog, if it exists.

    IMPORTANT:
    The canonical historical CSV is not guaranteed to contain
    every currently approved catalog item in every reporting
    week. Some valid current items may have:

    - no row in the latest historical week
    - zero numeric history
    - insufficient history for forecasting

    Therefore the current catalog CSV is the persistent source
    of truth for catalog membership. The latest canonical week
    can refresh identities and add new series, but it must not
    silently delete catalog entries merely because they are
    absent from that historical week.
    """

    if not CATALOG_CSV.exists():
        return {}

    with CATALOG_CSV.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)

        required_columns = {
            "series_key",
            "category",
            "commodity",
            "specification",
            "unit",
        }

        if not reader.fieldnames:
            raise ValueError(
                "Current catalog CSV has no header."
            )

        missing = (
            required_columns
            - set(reader.fieldnames)
        )

        if missing:
            raise ValueError(
                "Current catalog CSV is missing required "
                f"columns: {', '.join(sorted(missing))}"
            )

        catalog = {}

        for row in reader:
            series_key = clean_text(
                row.get("series_key")
            )

            if not series_key:
                continue

            identity = {
                "series_key": series_key,

                "category": clean_text(
                    row.get("category")
                ),

                "commodity": clean_text(
                    row.get("commodity")
                ),

                "specification":
                    display_specification(
                        row.get("specification")
                    ),

                "unit": clean_text(
                    row.get("unit")
                ),
            }

            if series_key in catalog:
                previous = catalog[series_key]

                if previous != identity:
                    raise ValueError(
                        "Conflicting identities were found "
                        "for the same series_key in the "
                        "existing current catalog:\n"
                        f"{series_key}"
                    )

            catalog[series_key] = identity

    return catalog


def build_latest_week_catalog(latest_week_rows):
    """
    Build identities from every unique series actually present
    in the latest canonical reporting week.

    These identities are used to:
    - refresh matching existing catalog entries
    - add genuinely new series

    They are NOT used by themselves to decide which older
    current catalog entries should be deleted.
    """

    catalog = {}

    for row in latest_week_rows:
        series_key = clean_text(
            row.get("series_key")
        )

        if not series_key:
            continue

        current_identity = {
            "series_key": series_key,

            "category": clean_text(
                row.get("category_normalized")
                or row.get("category_raw")
            ),

            "commodity": clean_text(
                row.get("commodity_normalized")
                or row.get("commodity_raw")
            ),

            "specification":
                display_specification(
                    row.get(
                        "specification_normalized"
                    )
                    or row.get(
                        "specification_raw"
                    )
                ),

            "unit": clean_text(
                row.get("unit")
            ),
        }

        if series_key in catalog:
            previous = catalog[series_key]

            if previous != current_identity:
                raise ValueError(
                    "Conflicting identities were found "
                    "for the same series_key in the "
                    "latest reporting week:\n"
                    f"{series_key}"
                )

        catalog[series_key] = (
            current_identity
        )

    if not catalog:
        raise ValueError(
            "No valid catalog series were found "
            "in the latest reporting week."
        )

    return catalog


def merge_current_catalog(
    existing_catalog,
    latest_week_catalog,
):
    """
    Preserve the approved current catalog and merge in the
    latest reporting-week identities.

    Rules:
    1. Existing current catalog entries are preserved.
    2. If an existing series appears in the latest week, its
       display identity is refreshed from the latest canonical
       row.
    3. A new series_key in the latest week is added.
    4. Absence from one canonical week does NOT delete a
       current catalog entry.

    This is important for valid catalog items that have zero
    history, insufficient history, or no row in a particular
    historical week.
    """

    merged = dict(existing_catalog)

    for (
        series_key,
        latest_identity,
    ) in latest_week_catalog.items():
        merged[series_key] = (
            latest_identity
        )

    if not merged:
        raise ValueError(
            "No current catalog series could be built."
        )

    return merged


# ============================================================
# HISTORY INDEX
# ============================================================

def build_history_index(rows):
    """
    Store every canonical row by series_key.
    """

    history = {}

    for row in rows:
        series_key = clean_text(
            row.get("series_key")
        )

        if not series_key:
            continue

        history.setdefault(
            series_key,
            [],
        ).append(row)

    return history


# ============================================================
# SERIES STATISTICS
# ============================================================

def calculate_series_statistics(
    series_key,
    history_rows,
    latest_week,
):
    """
    Calculate forecasting/catalog statistics for one current
    series.
    """

    numeric_records = []

    latest_pdf_row = None

    for row in history_rows:
        week_start = clean_text(
            row.get("week_start")
        )

        price = parse_price(
            row.get("weekly_average_price")
        )

        if price is not None:
            numeric_records.append(
                {
                    "week_start": week_start,
                    "price": price,
                }
            )

        if week_start == latest_week:
            latest_pdf_row = row

    # --------------------------------------------------------
    # NUMERIC HISTORY
    # --------------------------------------------------------

    numeric_records.sort(
        key=lambda item: item["week_start"]
    )

    numeric_observations = len(
        numeric_records
    )

    if numeric_records:
        first_numeric_week = (
            numeric_records[0][
                "week_start"
            ]
        )

        latest_numeric_week = (
            numeric_records[-1][
                "week_start"
            ]
        )

        latest_numeric_price = (
            numeric_records[-1][
                "price"
            ]
        )

    else:
        first_numeric_week = ""
        latest_numeric_week = ""
        latest_numeric_price = None

    # --------------------------------------------------------
    # LATEST PDF PRICE / AVAILABILITY
    # --------------------------------------------------------

    if latest_pdf_row is None:
        latest_pdf_price = None

        latest_pdf_availability = (
            "not present in latest report"
        )

    else:
        latest_pdf_price = parse_price(
            latest_pdf_row.get(
                "weekly_average_price"
            )
        )

        if latest_pdf_price is None:
            latest_pdf_availability = (
                "not sold / no price (-)"
            )

        else:
            latest_pdf_availability = (
                "available"
            )

    forecast_eligible = (
        numeric_observations
        >= FORECAST_MINIMUM_OBSERVATIONS
    )

    return {
        "numeric_observations":
            numeric_observations,

        "first_numeric_week":
            first_numeric_week,

        "latest_numeric_week":
            latest_numeric_week,

        "latest_numeric_price":
            format_price(
                latest_numeric_price
            ),

        "latest_pdf_price":
            format_price(
                latest_pdf_price
            ),

        "latest_pdf_availability":
            latest_pdf_availability,

        "forecast_eligible_16_plus":
            "yes"
            if forecast_eligible
            else "no",
    }


# ============================================================
# BUILD OUTPUT
# ============================================================

def generate_catalog_rows(
    all_rows,
    latest_week,
):
    latest_week_rows = [
        row
        for row in all_rows
        if clean_text(
            row.get("week_start")
        )
        == latest_week
    ]

    existing_catalog = (
        load_existing_catalog()
    )

    latest_week_catalog = (
        build_latest_week_catalog(
            latest_week_rows
        )
    )

    current_catalog = (
        merge_current_catalog(
            existing_catalog,
            latest_week_catalog,
        )
    )

    history_index = (
        build_history_index(all_rows)
    )

    output_rows = []

    # Stable readable ordering
    sorted_catalog = sorted(
        current_catalog.values(),
        key=lambda item: (
            item["category"].lower(),
            item["commodity"].lower(),
            item["specification"].lower(),
            item["unit"].lower(),
            item["series_key"].lower(),
        ),
    )

    for index, identity in enumerate(
        sorted_catalog,
        start=1,
    ):
        series_key = identity["series_key"]

        history_rows = history_index.get(
            series_key,
            [],
        )

        stats = (
            calculate_series_statistics(
                series_key,
                history_rows,
                latest_week,
            )
        )

        output_rows.append(
            {
                "index": index,

                "series_key":
                    series_key,

                "category":
                    identity["category"],

                "commodity":
                    identity["commodity"],

                "specification":
                    identity[
                        "specification"
                    ],

                "unit":
                    identity["unit"],

                **stats,
            }
        )

    return {
        "rows": output_rows,
        "existing_catalog_count":
            len(existing_catalog),
        "latest_week_count":
            len(latest_week_catalog),
        "merged_catalog_count":
            len(current_catalog),
    }


# ============================================================
# BACKUP
# ============================================================

def create_backup():
    if not CATALOG_CSV.exists():
        return None

    BACKUP_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    timestamp = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    backup_path = (
        BACKUP_DIR
        / (
            "current_catalog_forecast_eligibility"
            f"_{timestamp}.csv"
        )
    )

    counter = 1

    while backup_path.exists():
        backup_path = (
            BACKUP_DIR
            / (
                "current_catalog_forecast_eligibility"
                f"_{timestamp}_{counter}.csv"
            )
        )

        counter += 1

    shutil.copy2(
        CATALOG_CSV,
        backup_path,
    )

    return backup_path


# ============================================================
# WRITE TEMP FILE
# ============================================================

def write_catalog_temp(output_rows):
    temp_path = CATALOG_CSV.with_name(
        CATALOG_CSV.name
        + f".tmp-{os.getpid()}"
    )

    with temp_path.open(
        "w",
        encoding="utf-8",
        newline="",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=OUTPUT_COLUMNS,
            extrasaction="raise",
        )

        writer.writeheader()

        writer.writerows(
            output_rows
        )

        file.flush()

        os.fsync(
            file.fileno()
        )

    return temp_path


# ============================================================
# VALIDATE GENERATED FILE
# ============================================================

def validate_generated_catalog(
    temp_path,
    expected_rows,
    latest_week,
):
    with temp_path.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != OUTPUT_COLUMNS:
            raise ValueError(
                "Generated catalog has an "
                "unexpected header."
            )

        generated_rows = list(
            reader
        )

    if len(generated_rows) != expected_rows:
        raise ValueError(
            "Generated catalog row count mismatch. "
            f"Expected {expected_rows}, "
            f"found {len(generated_rows)}."
        )

    series_keys = [
        row["series_key"]
        for row in generated_rows
    ]

    if len(series_keys) != len(
        set(series_keys)
    ):
        raise ValueError(
            "Generated catalog contains duplicate "
            "series_key values."
        )

    for row_number, row in enumerate(
        generated_rows,
        start=2,
    ):
        if not clean_text(
            row["series_key"]
        ):
            raise ValueError(
                f"Row {row_number} has no series_key."
            )

        if not clean_text(
            row["category"]
        ):
            raise ValueError(
                f"Row {row_number} has no category."
            )

        if not clean_text(
            row["commodity"]
        ):
            raise ValueError(
                f"Row {row_number} has no commodity."
            )

        if not clean_text(
            row["unit"]
        ):
            raise ValueError(
                f"Row {row_number} has no unit."
            )


# ============================================================
# SUMMARY
# ============================================================

def print_summary(
    output_rows,
    latest_week,
    dry_run,
    backup_path=None,
):
    total = len(output_rows)

    eligible = sum(
        1
        for row in output_rows
        if row[
            "forecast_eligible_16_plus"
        ]
        == "yes"
    )

    ineligible = total - eligible

    available = sum(
        1
        for row in output_rows
        if row[
            "latest_pdf_availability"
        ]
        == "available"
    )

    unavailable = sum(
        1
        for row in output_rows
        if row[
            "latest_pdf_availability"
        ]
        == "not sold / no price (-)"
    )

    not_present = sum(
        1
        for row in output_rows
        if row[
            "latest_pdf_availability"
        ]
        == "not present in latest report"
    )

    zero_numeric = [
        row
        for row in output_rows
        if int(
            row[
                "numeric_observations"
            ]
        )
        == 0
    ]

    print()
    print("=" * 60)

    if dry_run:
        print(
            "PRICE CATALOG DRY RUN PASSED"
        )
    else:
        print(
            "PRICE CATALOG UPDATED SUCCESSFULLY"
        )

    print("=" * 60)

    print(
        f"Canonical CSV: {CANONICAL_CSV}"
    )

    print(
        f"Latest reporting week: {latest_week}"
    )

    print(
        f"Current catalog series: {total}"
    )

    print(
        f"Forecast eligible (>=16): {eligible}"
    )

    print(
        f"Forecast ineligible (<16): {ineligible}"
    )

    print(
        f"Latest prices available: {available}"
    )

    print(
        f"Latest prices unavailable: {unavailable}"
    )

    print(
        f"Catalog series not present in latest report: "
        f"{not_present}"
    )

    print(
        f"Series with zero numeric observations: "
        f"{len(zero_numeric)}"
    )

    if zero_numeric:
        print()
        print(
            "Zero-history current series:"
        )

        for row in zero_numeric:
            print(
                " - "
                f"{row['series_key']}"
            )

    if dry_run:
        print()
        print(
            "Dry run only. "
            "No catalog file was changed."
        )

    else:
        print()
        print(
            f"Catalog written: {CATALOG_CSV}"
        )

        if backup_path:
            print(
                f"Backup created: {backup_path}"
            )

    print("=" * 60)
    print()


# ============================================================
# MAIN UPDATE
# ============================================================

def update_catalog(dry_run=False):
    print()
    print(
        "Loading canonical price data..."
    )

    all_rows = load_canonical_rows()

    print(
        f"Canonical data rows: "
        f"{len(all_rows)}"
    )

    latest_week = find_latest_week(
        all_rows
    )

    print(
        f"Latest reporting week: "
        f"{latest_week}"
    )

    generated = (
        generate_catalog_rows(
            all_rows,
            latest_week,
        )
    )

    output_rows = generated["rows"]

    print(
        f"Existing catalog series loaded: "
        f"{generated['existing_catalog_count']}"
    )

    print(
        f"Series present in latest week: "
        f"{generated['latest_week_count']}"
    )

    print(
        f"Current catalog series after merge: "
        f"{generated['merged_catalog_count']}"
    )

    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    if dry_run:
        print_summary(
            output_rows,
            latest_week,
            dry_run=True,
        )

        return

    # --------------------------------------------------------
    # BACKUP EXISTING CATALOG
    # --------------------------------------------------------

    backup_path = create_backup()

    if backup_path:
        print(
            f"Backup created: "
            f"{backup_path}"
        )

    # --------------------------------------------------------
    # WRITE TEMP
    # --------------------------------------------------------

    temp_path = None

    try:
        temp_path = (
            write_catalog_temp(
                output_rows
            )
        )

        # ----------------------------------------------------
        # VALIDATE TEMP
        # ----------------------------------------------------

        validate_generated_catalog(
            temp_path,
            expected_rows=len(
                output_rows
            ),
            latest_week=latest_week,
        )

        # ----------------------------------------------------
        # ATOMIC REPLACE
        # ----------------------------------------------------

        os.replace(
            temp_path,
            CATALOG_CSV,
        )

        temp_path = None

    except Exception:
        if (
            temp_path
            and temp_path.exists()
        ):
            temp_path.unlink(
                missing_ok=True
            )

        raise

    print_summary(
        output_rows,
        latest_week,
        dry_run=False,
        backup_path=backup_path,
    )


# ============================================================
# COMMAND LINE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Regenerate the current DA price catalog "
            "and forecast eligibility data from the "
            "canonical weekly price CSV."
        )
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Calculate and validate the new catalog "
            "without replacing the existing catalog CSV."
        ),
    )

    args = parser.parse_args()

    try:
        update_catalog(
            dry_run=args.dry_run
        )

    except Exception as error:
        print()
        print("=" * 60)
        print(
            "PRICE CATALOG UPDATE FAILED"
        )
        print("=" * 60)

        print(
            str(error)
        )

        print()
        print(
            "The current catalog file was not "
            "intentionally replaced."
        )

        print("=" * 60)
        print()

        sys.exit(1)


if __name__ == "__main__":
    main()