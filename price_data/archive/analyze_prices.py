import pandas as pd
import os

# --------------------------------------------------
# LOAD DATA
# --------------------------------------------------

csv_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "price_dataset_raw.csv"
)

df = pd.read_csv(csv_path)

print("=" * 60)
print("PRICE DATASET ANALYSIS")
print("=" * 60)

print(f"\nTotal records: {len(df):,}")
print(f"Total columns: {len(df.columns)}")

print("\nColumns:")
print(df.columns.tolist())


# --------------------------------------------------
# BASIC INFORMATION
# --------------------------------------------------

print("\n" + "=" * 60)
print("DATE RANGE")
print("=" * 60)

df["week_start"] = pd.to_datetime(df["week_start"], errors="coerce")
df["week_end"] = pd.to_datetime(df["week_end"], errors="coerce")

print(f"Earliest week: {df['week_start'].min().date()}")
print(f"Latest week:   {df['week_end'].max().date()}")


# --------------------------------------------------
# NUMBER OF RECORDS PER YEAR
# --------------------------------------------------

print("\n" + "=" * 60)
print("RECORDS PER YEAR")
print("=" * 60)

df["year"] = df["week_start"].dt.year

print(df["year"].value_counts().sort_index())


# --------------------------------------------------
# MOST COMMON RAW ITEMS
# --------------------------------------------------

print("\n" + "=" * 60)
print("TOP 30 COMMODITIES / ITEMS")
print("=" * 60)

item_counts = df["raw_item"].value_counts()

print(item_counts.head(30).to_string())


# --------------------------------------------------
# CHECK IMPORTANT COMMODITIES
# --------------------------------------------------

target_items = [
    "Tomato",
    "Red Onion",
    "White Onion",
    "Garlic",
    "Eggplant",
    "Cabbage",
    "Carrot",
    "White Potato",
    "Ginger"
]

print("\n" + "=" * 60)
print("TARGET COMMODITY COUNTS")
print("=" * 60)

for item in target_items:
    matches = df[
        df["raw_item"]
        .astype(str)
        .str.contains(item, case=False, na=False)
    ]

    print(f"{item:15} : {len(matches):4} records")


# --------------------------------------------------
# UNIQUE RAW ITEMS
# --------------------------------------------------

print("\n" + "=" * 60)
print("NUMBER OF UNIQUE ITEMS")
print("=" * 60)

print(df["raw_item"].nunique())


# --------------------------------------------------
# MISSING PRICES
# --------------------------------------------------

print("\n" + "=" * 60)
print("MISSING / INVALID PRICES")
print("=" * 60)

print(
    "Missing prices:",
    df["weekly_average_price"].isna().sum()
)

print(
    "Zero prices:",
    (df["weekly_average_price"] == 0).sum()
)


# --------------------------------------------------
# DUPLICATES
# --------------------------------------------------

print("\n" + "=" * 60)
print("DUPLICATES")
print("=" * 60)

duplicates = df.duplicated(
    subset=[
        "week_start",
        "raw_item",
        "unit",
        "weekly_average_price"
    ]
).sum()

print(f"Duplicate records: {duplicates}")


# --------------------------------------------------
# SUMMARY
# --------------------------------------------------

print("\n" + "=" * 60)
print("ANALYSIS COMPLETE")
print("=" * 60)