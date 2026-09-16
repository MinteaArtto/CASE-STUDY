import pandas as pd
import os

csv_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "price_dataset_raw.csv"
)

df = pd.read_csv(csv_path)

df["week_start"] = pd.to_datetime(
    df["week_start"],
    errors="coerce"
)

df["weekly_average_price"] = pd.to_numeric(
    df["weekly_average_price"],
    errors="coerce"
)

# Exact commodity/specification names we want to inspect
items = [
    "Tomato 15-18 pcs/kg",
    "Red Onion 13-15 pcs/kg",
    "Red Onion, Local 13-15 pcs/kg",
    "Red Onion, Imported",
    "Garlic (Native)",
    "Garlic, Native/Local",
    "Garlic (Imported)",
    "Garlic, Imported",
    "Cabbage (Scorpio) 750 gm - 1 kg/head",
    "Cabbage (Rare Ball) 510 gm - 1 kg/head",
    "Cabbage (Wonder Ball) 510 gm - 1 kg/head",
    "Carrots 8-10 pcs/kg",
    "Carrots, Local 8-10 pcs/kg",
    "White Potato 10-12 pcs/kg",
    "White Potato, Local 10-12 pcs/kg",
    "Eggplant 3-4 Small Bundles"
]

for item in items:

    data = df[df["raw_item"] == item].copy()

    if data.empty:
        continue

    data = data.sort_values("week_start")

    dates = data["week_start"].drop_duplicates().sort_values()

    gaps = dates.diff().dt.days.dropna()

    print("\n" + "=" * 70)
    print(item)
    print("=" * 70)

    print(f"Records:       {len(data)}")
    print(f"First week:    {dates.min().date()}")
    print(f"Last week:     {dates.max().date()}")

    if len(gaps) > 0:
        print(f"Largest gap:   {gaps.max()} days")

        large_gaps = gaps[gaps > 14]

        if len(large_gaps) > 0:
            print("Gaps greater than 2 weeks detected:")
            print(large_gaps.to_string())
        else:
            print("No gaps greater than 2 weeks.")

    print("\nRecent observations:")

    print(
        data[
            [
                "week_start",
                "weekly_average_price"
            ]
        ]
        .tail(10)
        .to_string(index=False)
    )