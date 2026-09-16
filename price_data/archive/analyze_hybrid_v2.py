import os
import pandas as pd


BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DATASET_PATH = os.path.join(
    BASE_DIR,
    "price_dataset_hybrid_v2.csv"
)

LOG_PATH = os.path.join(
    BASE_DIR,
    "price_extraction_log_v2.csv"
)


# ============================================================
# LOAD DATASET
# ============================================================

df = pd.read_csv(
    DATASET_PATH
)

df["week_start"] = pd.to_datetime(
    df["week_start"],
    errors="coerce"
)

df["week_end"] = pd.to_datetime(
    df["week_end"],
    errors="coerce"
)

df["weekly_average_price"] = pd.to_numeric(
    df["weekly_average_price"],
    errors="coerce"
)


print()
print("=" * 80)
print("HYBRID V2 DATASET ANALYSIS")
print("=" * 80)

print(
    f"\nTotal records : {len(df)}"
)

print(
    f"Earliest week : "
    f"{df['week_start'].min().date()}"
)

print(
    f"Latest week   : "
    f"{df['week_start'].max().date()}"
)

print(
    f"Commodities   : "
    f"{df['commodity'].nunique()}"
)


# ============================================================
# MISSING VALUES
# ============================================================

print()
print("=" * 80)
print("MISSING VALUES")
print("=" * 80)

print(
    f"Missing prices : "
    f"{df['weekly_average_price'].isna().sum()}"
)

print(
    f"Missing dates  : "
    f"{df['week_start'].isna().sum()}"
)


# ============================================================
# DUPLICATE COMMODITY/WEEK CHECK
# ============================================================

duplicates = df.duplicated(
    subset=[
        "week_start",
        "commodity"
    ],
    keep=False
)

duplicate_df = df[
    duplicates
].sort_values(
    [
        "week_start",
        "commodity"
    ]
)

print()
print("=" * 80)
print("DUPLICATE WEEK + COMMODITY RECORDS")
print("=" * 80)

print(
    f"Duplicate rows: "
    f"{len(duplicate_df)}"
)

if len(duplicate_df) > 0:

    print(
        duplicate_df[
            [
                "week_start",
                "commodity",
                "weekly_average_price",
                "source_file",
                "extraction_method"
            ]
        ].to_string(
            index=False
        )
    )


# ============================================================
# RECORDS BY YEAR
# ============================================================

df["year"] = (
    df["week_start"]
    .dt.year
)

print()
print("=" * 80)
print("RECORDS BY YEAR")
print("=" * 80)

print(
    df["year"]
    .value_counts()
    .sort_index()
)


# ============================================================
# COMMODITY COUNTS
# ============================================================

print()
print("=" * 80)
print("COMMODITY COUNTS")
print("=" * 80)

counts = (
    df["commodity"]
    .value_counts()
)

for commodity, count in counts.items():

    print(
        f"{commodity:<28}: "
        f"{count:>4}"
    )


# ============================================================
# WEEKLY COVERAGE
# ============================================================

print()
print("=" * 80)
print("WEEKLY COVERAGE")
print("=" * 80)

coverage_results = []


for commodity in sorted(
    df["commodity"].unique()
):

    temp = (
        df[
            df["commodity"]
            == commodity
        ]
        .sort_values(
            "week_start"
        )
        .copy()
    )

    # Remove duplicate dates for gap analysis
    temp = temp.drop_duplicates(
        subset=["week_start"]
    )

    temp["gap_days"] = (
        temp["week_start"]
        .diff()
        .dt.days
    )

    largest_gap = (
        temp["gap_days"].max()
    )

    if pd.isna(
        largest_gap
    ):
        largest_gap = 0

    gaps_over_14 = (
        temp["gap_days"]
        > 14
    ).sum()

    coverage_results.append({
        "commodity":
            commodity,

        "records":
            len(temp),

        "first":
            temp["week_start"].min(),

        "last":
            temp["week_start"].max(),

        "largest_gap":
            int(largest_gap),

        "gaps_over_14":
            int(gaps_over_14),
    })


for result in coverage_results:

    print()

    print(
        f"{result['commodity']}"
    )

    print(
        f"  Records       : "
        f"{result['records']}"
    )

    print(
        f"  First week    : "
        f"{result['first'].date()}"
    )

    print(
        f"  Last week     : "
        f"{result['last'].date()}"
    )

    print(
        f"  Largest gap   : "
        f"{result['largest_gap']} days"
    )

    print(
        f"  Gaps >14 days : "
        f"{result['gaps_over_14']}"
    )


# ============================================================
# TOMATO DETAILED COVERAGE
# ============================================================

tomato = (
    df[
        df["commodity"]
        == "Tomato"
    ]
    .sort_values(
        "week_start"
    )
    .copy()
)

tomato = tomato.drop_duplicates(
    subset=["week_start"]
)

tomato["gap_days"] = (
    tomato["week_start"]
    .diff()
    .dt.days
)

print()
print("=" * 80)
print("TOMATO COVERAGE")
print("=" * 80)

print(
    f"Records     : "
    f"{len(tomato)}"
)

print(
    f"First week  : "
    f"{tomato['week_start'].min().date()}"
)

print(
    f"Last week   : "
    f"{tomato['week_start'].max().date()}"
)

print(
    f"Largest gap : "
    f"{tomato['gap_days'].max()} days"
)


tomato_gaps = tomato[
    tomato["gap_days"]
    > 14
][
    [
        "week_start",
        "gap_days"
    ]
]

print()
print(
    "Tomato gaps greater than 14 days:"
)

if tomato_gaps.empty:

    print(
        "None"
    )

else:

    print(
        tomato_gaps.to_string(
            index=False
        )
    )


# ============================================================
# WEEK-TO-WEEK PRICE CHANGE
#
# This only FLAGS values.
# It does NOT remove or modify anything.
# ============================================================

print()
print("=" * 80)
print("LARGE WEEK-TO-WEEK PRICE CHANGES")
print("=" * 80)

flagged = []


for commodity in (
    df["commodity"].unique()
):

    temp = (
        df[
            df["commodity"]
            == commodity
        ]
        .sort_values(
            "week_start"
        )
        .copy()
    )

    temp = temp.drop_duplicates(
        subset=["week_start"]
    )

    temp["previous_price"] = (
        temp[
            "weekly_average_price"
        ]
        .shift(1)
    )

    temp["pct_change"] = (
        temp[
            "weekly_average_price"
        ]
        .pct_change()
        * 100
    )

    suspicious = temp[
        temp["pct_change"]
        .abs()
        >= 50
    ]

    for _, row in suspicious.iterrows():

        flagged.append({
            "commodity":
                commodity,

            "week_start":
                row[
                    "week_start"
                ],

            "previous_price":
                row[
                    "previous_price"
                ],

            "current_price":
                row[
                    "weekly_average_price"
                ],

            "change_percent":
                row[
                    "pct_change"
                ],

            "method":
                row[
                    "extraction_method"
                ],

            "source":
                row[
                    "source_file"
                ],
        })


if not flagged:

    print(
        "No changes >= 50%."
    )

else:

    flagged_df = pd.DataFrame(
        flagged
    )

    print(
        flagged_df.to_string(
            index=False
        )
    )


# ============================================================
# EXTRACTION LOG ANALYSIS
# ============================================================

if os.path.exists(
    LOG_PATH
):

    log = pd.read_csv(
        LOG_PATH
    )

    print()
    print("=" * 80)
    print("EXTRACTION LOG")
    print("=" * 80)

    print(
        "\nStatus counts:"
    )

    print(
        log["status"]
        .value_counts()
    )

    print(
        "\nMethod counts:"
    )

    print(
        log[
            "selected_method"
        ]
        .value_counts()
    )

    weak = log[
        (
            log[
                "records_created"
            ]
            < 10
        )
    ]

    print()
    print(
        f"PDFs with fewer than "
        f"10 extracted records: "
        f"{len(weak)}"
    )

    if len(weak) > 0:

        print()

        print(
            weak[
                [
                    "source_file",
                    "records_created",
                    "targets_detected",
                    "selected_method"
                ]
            ].to_string(
                index=False
            )
        )