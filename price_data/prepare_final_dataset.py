import os
import pandas as pd


BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

INPUT_FILE = os.path.join(
    BASE_DIR,
    "price_dataset_hybrid_v2.csv"
)

OUTPUT_FILE = os.path.join(
    BASE_DIR,
    "price_dataset_final.csv"
)


# ============================================================
# LOAD DATA
# ============================================================

df = pd.read_csv(
    INPUT_FILE
)

print()
print("=" * 70)
print("PREPARING FINAL PRICE DATASET")
print("=" * 70)

print(
    f"\nOriginal records: {len(df)}"
)


# ============================================================
# KEEP ONLY TRUSTED TEXT-EXTRACTED RECORDS
# ============================================================

trusted_methods = [
    "pdfplumber",
    "pdfplumber_partial",
]

final_df = df[
    df["extraction_method"].isin(
        trusted_methods
    )
].copy()


# ============================================================
# CLEAN TYPES
# ============================================================

final_df["week_start"] = pd.to_datetime(
    final_df["week_start"],
    errors="coerce"
)

final_df["week_end"] = pd.to_datetime(
    final_df["week_end"],
    errors="coerce"
)

final_df["weekly_average_price"] = (
    pd.to_numeric(
        final_df["weekly_average_price"],
        errors="coerce"
    )
)


# ============================================================
# REMOVE INVALID ROWS
# ============================================================

final_df = final_df.dropna(
    subset=[
        "week_start",
        "commodity",
        "weekly_average_price",
    ]
)


# Prices must be positive.
final_df = final_df[
    final_df[
        "weekly_average_price"
    ] > 0
]


# ============================================================
# REMOVE DUPLICATES
# ============================================================

final_df = final_df.drop_duplicates(
    subset=[
        "week_start",
        "commodity",
    ],
    keep="first"
)


# ============================================================
# SORT
# ============================================================

final_df = final_df.sort_values(
    by=[
        "commodity",
        "week_start",
    ]
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

print(
    f"Final trusted records: "
    f"{len(final_df)}"
)

print(
    f"Removed OCR records: "
    f"{len(df) - len(final_df)}"
)

print(
    f"Commodities: "
    f"{final_df['commodity'].nunique()}"
)

print(
    f"Earliest date: "
    f"{final_df['week_start'].min().date()}"
)

print(
    f"Latest date: "
    f"{final_df['week_start'].max().date()}"
)


print()
print("=" * 70)
print("RECORDS PER COMMODITY")
print("=" * 70)

counts = (
    final_df["commodity"]
    .value_counts()
)

for commodity, count in counts.items():

    print(
        f"{commodity:<28}: "
        f"{count:>4}"
    )


print()
print("=" * 70)
print("RECORDS PER YEAR")
print("=" * 70)

print(
    final_df[
        "week_start"
    ]
    .dt.year
    .value_counts()
    .sort_index()
)


print()
print("=" * 70)
print("DATASET READY")
print("=" * 70)

print(
    f"\nSaved to:\n{OUTPUT_FILE}"
)