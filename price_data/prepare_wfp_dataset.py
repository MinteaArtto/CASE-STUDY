import os
import pandas as pd


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

INPUT_FILE = os.path.join(
    BASE_DIR,
    "wfp_food_prices_phl.csv"
)

OUTPUT_FILE = os.path.join(
    BASE_DIR,
    "price_dataset_wfp.csv"
)


# ============================================================
# COMMODITY MAPPING
#
# Only mappings that are reasonably direct.
# ============================================================

COMMODITY_MAP = {

    # ========================================================
    # VEGETABLES / ROOT CROPS / AROMATICS
    # ========================================================

    "Tomatoes":
        "Tomato",

    "Carrots":
        "Carrots",

    "Onions (red)":
        "Red Onion",

    "Onions (white)":
        "White Onion",

    "Potatoes (Irish)":
        "White Potato",

    "Cabbage":
        "Cabbage",

    "Eggplants":
        "Eggplant",

    "Bitter melon":
        "Ampalaya",

    "Ginger":
        "Ginger",

    "Squashes":
        "Squash",

    "Garlic":
        "Garlic",


    # ========================================================
    # FRUITS
    # ========================================================

    "Bananas (lakatan)":
        "Banana (Lakatan)",

    "Mangoes (carabao)":
        "Mango (Carabao)",

    "Calamansi":
        "Calamansi",
}

# ============================================================
# LOAD DATA
# ============================================================

print()
print("=" * 75)
print("PREPARING WFP / RICELYTICS PRICE DATASET")
print("=" * 75)

print(
    f"\nInput file:\n{INPUT_FILE}"
)

df = pd.read_csv(
    INPUT_FILE,
    low_memory=False
)

print(
    f"\nOriginal rows: "
    f"{len(df):,}"
)

print(
    f"Original columns: "
    f"{len(df.columns)}"
)


# ============================================================
# CLEAN BASIC FIELDS
# ============================================================

df["date"] = pd.to_datetime(
    df["date"],
    errors="coerce"
)

df["price"] = pd.to_numeric(
    df["price"],
    errors="coerce"
)


# ============================================================
# FILTER TO NCR / METRO MANILA / RETAIL
#
# We use the exact values present in the source CSV.
# ============================================================

filtered = df[
    (
        df["admin1"]
        == "National Capital region"
    )
    &
    (
        df["admin2"]
        == "Metropolitan Manila"
    )
    &
    (
        df["market"]
        == "Metro Manila"
    )
    &
    (
        df["pricetype"]
        == "Retail"
    )
    &
    (
        df["currency"]
        == "PHP"
    )
    &
    (
        df["unit"]
        == "KG"
    )
].copy()


print()
print(
    f"NCR Metro Manila retail KG rows: "
    f"{len(filtered):,}"
)


# ============================================================
# KEEP ONLY COMMODITIES WE CAN MAP SAFELY
# ============================================================

filtered = filtered[
    filtered[
        "commodity"
    ].isin(
        COMMODITY_MAP.keys()
    )
].copy()


# ============================================================
# KEEP ORIGINAL NAME AND CREATE SYSTEM NAME
# ============================================================

filtered[
    "source_commodity"
] = filtered[
    "commodity"
]


filtered[
    "commodity"
] = filtered[
    "source_commodity"
].map(
    COMMODITY_MAP
)


# ============================================================
# REMOVE INVALID DATA
# ============================================================

filtered = filtered.dropna(
    subset=[
        "date",
        "commodity",
        "price",
    ]
)


filtered = filtered[
    filtered["price"] > 0
].copy()


# ============================================================
# REMOVE DUPLICATE MONTH + COMMODITY
#
# There should normally only be one NCR retail observation
# per commodity/date.
# ============================================================

before_duplicates = len(
    filtered
)

filtered = filtered.drop_duplicates(
    subset=[
        "date",
        "commodity",
    ],
    keep="first"
)

duplicates_removed = (
    before_duplicates
    - len(filtered)
)


# ============================================================
# CREATE TIME FEATURES FOR INSPECTION
# ============================================================

filtered[
    "year"
] = filtered[
    "date"
].dt.year


filtered[
    "month"
] = filtered[
    "date"
].dt.month


# ============================================================
# SORT
# ============================================================

filtered = filtered.sort_values(
    by=[
        "commodity",
        "date",
    ]
).reset_index(
    drop=True
)


# ============================================================
# FINAL COLUMN NAMES
# ============================================================

final_df = filtered[
    [
        "date",
        "year",
        "month",
        "commodity",
        "source_commodity",
        "price",
        "admin1",
        "admin2",
        "market",
        "pricetype",
        "currency",
        "unit",
    ]
].copy()


final_df = final_df.rename(
    columns={
        "price":
            "monthly_average_price"
    }
)


# ============================================================
# SAVE
# ============================================================

final_df.to_csv(
    OUTPUT_FILE,
    index=False,
    encoding="utf-8-sig"
)


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 75)
print("FINAL DATASET SUMMARY")
print("=" * 75)

print(
    f"Final records       : "
    f"{len(final_df):,}"
)

print(
    f"Duplicates removed  : "
    f"{duplicates_removed}"
)

print(
    f"Commodities         : "
    f"{final_df['commodity'].nunique()}"
)

print(
    f"Earliest date       : "
    f"{final_df['date'].min().date()}"
)

print(
    f"Latest date         : "
    f"{final_df['date'].max().date()}"
)


# ============================================================
# RECORD COUNTS
# ============================================================

print()
print("=" * 75)
print("RECORDS PER COMMODITY")
print("=" * 75)

counts = (
    final_df
    .groupby(
        "commodity"
    )
    .size()
    .sort_values(
        ascending=False
    )
)


for commodity, count in (
    counts.items()
):

    print(
        f"{commodity:<22}: "
        f"{count:>4}"
    )


# ============================================================
# DATE RANGE PER COMMODITY
# ============================================================

print()
print("=" * 75)
print("DATE RANGE PER COMMODITY")
print("=" * 75)


for commodity in sorted(
    final_df[
        "commodity"
    ].unique()
):

    temp = final_df[
        final_df[
            "commodity"
        ]
        == commodity
    ]

    print()

    print(
        commodity
    )

    print(
        f"  Records    : "
        f"{len(temp)}"
    )

    print(
        f"  First date : "
        f"{temp['date'].min().date()}"
    )

    print(
        f"  Last date  : "
        f"{temp['date'].max().date()}"
    )


# ============================================================
# IMPORTANT WARNING
# ============================================================

print()
print("=" * 75)
print("IMPORTANT")
print("=" * 75)

print(
    "This is MONTHLY historical price data."
)

print(
    "Use it for 1-month and 3-month forecasting."
)

print(
    "Do not treat these observations as weekly prices."
)


print()
print(
    f"Dataset saved to:\n"
    f"{OUTPUT_FILE}"
)