from pdf2image import convert_from_path
import pytesseract
from pytesseract import Output
import pandas as pd
import re
import sys

# ============================================================
# WINDOWS PATHS
# ============================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = r"C:\poppler-26.02.0\Library\bin"


# ============================================================
# TARGET COMMODITIES
# ============================================================

TARGETS = [
    "Tomato",
    "Eggplant",
    "Cabbage",
    "Carrots",
    "White Potato",
    "Red Onion",
    "White Onion",
    "Garlic",
    "Ginger",
    "Ampalaya",
    "Sitao",
    "Pechay",
    "Squash",
]


# ============================================================
# PRICE DETECTION
# ============================================================

def is_price(text):
    """
    Check whether OCR text looks like a price.

    Examples:
        79.45
        151.46
        807.72
    """

    text = text.replace(",", "").strip()

    return bool(
        re.fullmatch(r"\d{1,4}\.\d{2}", text)
    )


# ============================================================
# FIND TARGET COMMODITY
# ============================================================

def find_target(word):
    """
    Match OCR word against our target commodities.
    """

    cleaned = word.lower().strip()

    for target in TARGETS:
        target_lower = target.lower()

        if cleaned == target_lower:
            return target

        # OCR may attach punctuation
        cleaned_no_punct = re.sub(
            r"[^a-zA-Z]",
            "",
            cleaned
        )

        target_no_punct = re.sub(
            r"[^a-zA-Z]",
            "",
            target_lower
        )

        if cleaned_no_punct == target_no_punct:
            return target

    return None


# ============================================================
# PROCESS ONE PAGE
# ============================================================

def process_page(page):

    print("\nRunning coordinate-based OCR...")

    data = pytesseract.image_to_data(
        page,
        output_type=Output.DATAFRAME,
        config="--psm 6"
    )

    # Remove empty OCR results
    data = data.dropna(
        subset=["text"]
    )

    data["text"] = data["text"].astype(str).str.strip()

    data = data[
        data["text"] != ""
    ]

    results = []

    print("\n==============================")
    print("TARGET COMMODITIES FOUND")
    print("==============================")

    for index, row in data.iterrows():

        target = find_target(row["text"])

        if target is None:
            continue

        x = int(row["left"])
        y = int(row["top"])
        width = int(row["width"])
        height = int(row["height"])

        # ----------------------------------------------------
        # Find words on approximately the same row
        # ----------------------------------------------------

        same_row = data[
            (
                abs(
                    data["top"] - y
                ) <= max(15, height)
            )
        ].copy()

        # Sort left → right
        same_row = same_row.sort_values(
            by="left"
        )

        # ----------------------------------------------------
        # Show the OCR row
        # ----------------------------------------------------

        row_text = " ".join(
            same_row["text"].tolist()
        )

        print(f"\n{target}")
        print(f"Y position: {y}")
        print(f"Row: {row_text}")

        # ----------------------------------------------------
        # Look for prices on same row
        # ----------------------------------------------------

        prices = []

        for _, candidate in same_row.iterrows():

            candidate_text = str(
                candidate["text"]
            ).strip()

            if not is_price(candidate_text):
                continue

            price_x = int(candidate["left"])

            prices.append({
                "price": float(
                    candidate_text.replace(",", "")
                ),
                "x": price_x
            })

        # ----------------------------------------------------
        # Choose price closest to commodity
        # ----------------------------------------------------

        if prices:

            prices.sort(
                key=lambda p: abs(p["x"] - x)
            )

            selected_price = prices[0]["price"]

            print(
                f"Possible price: {selected_price:.2f}"
            )

            results.append({
                "commodity": target,
                "ocr_y": y,
                "price": selected_price,
                "row_text": row_text
            })

        else:

            print("No price found on same row.")

            results.append({
                "commodity": target,
                "ocr_y": y,
                "price": None,
                "row_text": row_text
            })

    return results


# ============================================================
# MAIN
# ============================================================

if len(sys.argv) < 2:

    print(
        "\nUsage:"
    )

    print(
        'python price_data\\test_ocr_coordinates.py "PDF_PATH"'
    )

    sys.exit(1)


pdf_path = sys.argv[1]

print(
    f"\nTesting coordinate OCR:"
)
print(pdf_path)


# ============================================================
# CONVERT PDF → IMAGE
# ============================================================

print(
    "\nConverting PDF page to image..."
)

pages = convert_from_path(
    pdf_path,
    dpi=300,
    poppler_path=POPPLER_PATH
)


# ============================================================
# PROCESS PAGES
# ============================================================

all_results = []

for page_number, page in enumerate(pages):

    print(
        f"\n\n========================================"
    )
    print(
        f"OCR PAGE {page_number + 1}"
    )
    print(
        f"========================================"
    )

    results = process_page(page)

    all_results.extend(results)


# ============================================================
# DISPLAY RESULTS
# ============================================================

print(
    "\n\n========================================"
)
print(
    "FINAL RESULTS"
)
print(
    "========================================"
)

if not all_results:

    print(
        "No target commodities were detected."
    )

else:

    df = pd.DataFrame(all_results)

    print(
        df[
            [
                "commodity",
                "price",
                "row_text"
            ]
        ].to_string(index=False)
    )


# ============================================================
# SAVE TEST OUTPUT
# ============================================================

output_file = (
    "price_data/ocr_coordinate_test.csv"
)

df.to_csv(
    output_file,
    index=False
)

print(
    f"\nSaved test results to: {output_file}"
)