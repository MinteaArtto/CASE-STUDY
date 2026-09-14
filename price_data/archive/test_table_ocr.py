from pdf2image import convert_from_path
import pytesseract
import cv2
import numpy as np
import re
import sys
from difflib import SequenceMatcher


# ============================================================
# WINDOWS CONFIGURATION
# ============================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = r"C:\poppler-26.02.0\Library\bin"


# ============================================================
# TARGET COMMODITIES
# ============================================================

TARGET_COMMODITIES = [
    "Ampalaya",
    "Sitao",
    "Pechay (Native)",
    "Squash",
    "Eggplant",
    "Tomato",

    "Cabbage (Rare Ball)",
    "Cabbage (Scorpio)",
    "Cabbage (Wonder Ball)",

    "Carrots",
    "White Potato",
    "Pechay (Baguio)",

    "Red Onion",
    "Red Onion (Imported)",

    "White Onion",
    "White Onion (Imported)",

    "Garlic (Imported)",
    "Garlic (Native)",

    "Ginger",
]


# ============================================================
# CLEAN BASIC OCR TEXT
# ============================================================

def clean_text(text):

    if text is None:
        return ""

    text = str(text)

    text = text.replace("\n", " ")
    text = text.replace("|", " ")

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# ============================================================
# NORMALIZE COMMODITY
# ============================================================

def normalize_commodity(text):

    if not text:
        return ""

    text = text.lower()

    # Remove OCR symbols
    text = re.sub(
        r"[^a-z() ]",
        "",
        text
    )

    # Remove whitespace
    text = re.sub(
        r"\s+",
        " ",
        text
    )

    # Remove common junk at very beginning
    text = text.strip()

    while (
        len(text) > 1
        and text[0] in ["i", "l", "f"]
    ):
        text = text[1:].strip()

    return text


# ============================================================
# SIMILARITY
# ============================================================

def similarity(a, b):

    a = normalize_commodity(a)
    b = normalize_commodity(b)

    if not a or not b:
        return 0

    return SequenceMatcher(
        None,
        a,
        b
    ).ratio()


# ============================================================
# MATCH TARGET COMMODITY
# ============================================================

def match_target(ocr_name):

    text = normalize_commodity(
        ocr_name
    )

    if not text:
        return None, 0

    # ========================================================
    # DIRECT / SAFE MATCHING RULES
    # ========================================================

    if "ampalaya" in text:
        return "Ampalaya", 1.0

    if "sitao" in text:
        return "Sitao", 1.0

    if "tomato" in text:
        return "Tomato", 1.0

    if "carrot" in text:
        return "Carrots", 1.0

    if "potato" in text:
        return "White Potato", 1.0

    if "ginger" in text:
        return "Ginger", 1.0

    # --------------------------------------------------------
    # Squash
    # Handles OCR like:
    # Saquash
    # --------------------------------------------------------

    if (
        "squash" in text
        or "saquash" in text
    ):
        return "Squash", 0.95

    # --------------------------------------------------------
    # Eggplant
    # OCR example:
    # Eqaolant
    # --------------------------------------------------------

    if (
        "eggplant" in text
        or "eqaolant" in text
        or similarity(text, "eggplant") >= 0.68
    ):
        return "Eggplant", 0.90

    # --------------------------------------------------------
    # Pechay
    # --------------------------------------------------------

    if "pechay" in text:

        if "native" in text:
            return "Pechay (Native)", 1.0

        if (
            "baguio" in text
            or "baaquio" in text
            or "baquio" in text
        ):
            return "Pechay (Baguio)", 0.98

    # --------------------------------------------------------
    # Cabbage
    # OCR examples:
    # cabbacge
    # cabbaae
    # cabbooe
    # --------------------------------------------------------

    cabbage_like = (
        "cabb" in text
        or similarity(
            text.split("(")[0],
            "cabbage"
        ) >= 0.60
    )

    if cabbage_like:

        if "rare" in text:
            return "Cabbage (Rare Ball)", 0.98

        if "scorpio" in text:
            return "Cabbage (Scorpio)", 0.98

        if "wonder" in text:
            return "Cabbage (Wonder Ball)", 0.98

    # --------------------------------------------------------
    # Onion
    # --------------------------------------------------------

    if "onion" in text:

        imported = (
            "imported" in text
        )

        if "red" in text:

            if imported:
                return "Red Onion (Imported)", 1.0

            return "Red Onion", 1.0

        if "white" in text:

            if imported:
                return "White Onion (Imported)", 1.0

            return "White Onion", 1.0

    # --------------------------------------------------------
    # Garlic
    #
    # IMPORTANT:
    # Do NOT fuzzy-match arbitrary words to garlic.
    #
    # This prevents:
    # Galunggong → Garlic
    # --------------------------------------------------------

    garlic_like = (
        "garlic" in text
        or "gariic" in text
        or "garic" in text
    )

    if garlic_like:

        if "imported" in text:
            return "Garlic (Imported)", 0.98

        if "native" in text:
            return "Garlic (Native)", 0.98

    # ========================================================
    # NO GENERIC FALLBACK
    # ========================================================
    #
    # This is intentional.
    #
    # Previously:
    #
    # Papaya → Ampalaya
    # Galunggong → Garlic
    #
    # A missing target is safer than an incorrect target.
    #

    return None, 0


# ============================================================
# OCR NORMAL CELL
# ============================================================

def ocr_cell(image, psm=7):

    if image is None:
        return ""

    if image.size == 0:
        return ""

    image = cv2.resize(
        image,
        None,
        fx=2,
        fy=2,
        interpolation=cv2.INTER_CUBIC
    )

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    _, threshold = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    text = pytesseract.image_to_string(
        threshold,
        config=f"--psm {psm}"
    )

    return clean_text(text)


# ============================================================
# CLEAN PRICE
# ============================================================

def parse_price(text):

    if not text:
        return None

    text = str(text).strip()

    # Common substitutions
    text = text.replace(",", ".")
    text = text.replace("O", "0")
    text = text.replace("o", "0")

    # IMPORTANT:
    # do not automatically convert ]
    # because we want another OCR attempt first

    cleaned = re.sub(
        r"[^0-9.]",
        "",
        text
    )

    match = re.search(
        r"\d{1,4}\.\d{2}",
        cleaned
    )

    if match:

        try:
            return float(
                match.group()
            )

        except ValueError:
            return None

    return None


# ============================================================
# PRICE OCR
# ============================================================

def ocr_price_cell(image):

    if image is None or image.size == 0:
        return "", None

    # Make significantly larger than normal OCR
    enlarged = cv2.resize(
        image,
        None,
        fx=4,
        fy=4,
        interpolation=cv2.INTER_CUBIC
    )

    gray = cv2.cvtColor(
        enlarged,
        cv2.COLOR_BGR2GRAY
    )

    # ========================================================
    # ATTEMPT 1
    # ========================================================

    _, threshold1 = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    text1 = pytesseract.image_to_string(
        threshold1,
        config=(
            "--psm 7 "
            "-c tessedit_char_whitelist=0123456789./na"
        )
    )

    text1 = clean_text(
        text1
    )

    price1 = parse_price(
        text1
    )

    if price1 is not None:

        return text1, price1

    # ========================================================
    # ATTEMPT 2
    #
    # Adaptive threshold may recover digits that Otsu missed.
    # ========================================================

    threshold2 = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11
    )

    text2 = pytesseract.image_to_string(
        threshold2,
        config=(
            "--psm 7 "
            "-c tessedit_char_whitelist=0123456789./na"
        )
    )

    text2 = clean_text(
        text2
    )

    price2 = parse_price(
        text2
    )

    if price2 is not None:

        return text2, price2

    # ========================================================
    # ATTEMPT 3
    #
    # Different page segmentation.
    # ========================================================

    text3 = pytesseract.image_to_string(
        threshold1,
        config=(
            "--psm 8 "
            "-c tessedit_char_whitelist=0123456789./na"
        )
    )

    text3 = clean_text(
        text3
    )

    price3 = parse_price(
        text3
    )

    if price3 is not None:

        return text3, price3

    # Return first recognizable raw output for debugging
    raw = text1 or text2 or text3

    return raw, None


# ============================================================
# FIND HORIZONTAL LINES
# ============================================================

def find_horizontal_lines(image):

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    binary = cv2.threshold(
        gray,
        180,
        255,
        cv2.THRESH_BINARY_INV
    )[1]

    height, width = binary.shape

    kernel_width = max(
        int(width * 0.25),
        30
    )

    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (kernel_width, 1)
    )

    horizontal = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        horizontal_kernel
    )

    contours, _ = cv2.findContours(
        horizontal,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    lines = []

    for contour in contours:

        x, y, w, h = cv2.boundingRect(
            contour
        )

        if w > width * 0.60:
            lines.append(y)

    lines = sorted(lines)

    merged = []

    tolerance = max(
        int(height * 0.002),
        3
    )

    for y in lines:

        if not merged:
            merged.append(y)

        elif y - merged[-1] > tolerance:
            merged.append(y)

    return merged


# ============================================================
# PROCESS TABLE
# ============================================================

def process_table(image):

    height, width, _ = image.shape

    print(
        f"\nImage size: "
        f"{width} x {height}"
    )

    horizontal_lines = find_horizontal_lines(
        image
    )

    print(
        f"Horizontal table lines detected: "
        f"{len(horizontal_lines)}"
    )

    # ========================================================
    # COLUMN COORDINATES
    # ========================================================

    commodity_x1 = int(
        width * 0.010
    )

    commodity_x2 = int(
        width * 0.325
    )

    specification_x1 = int(
        width * 0.325
    )

    specification_x2 = int(
        width * 0.655
    )

    unit_x1 = int(
        width * 0.655
    )

    unit_x2 = int(
        width * 0.755
    )

    price_x1 = int(
        width * 0.755
    )

    price_x2 = int(
        width * 0.990
    )

    results = []

    print("\n")
    print("=" * 110)
    print("EXTRACTED ROWS")
    print("=" * 110)

    for i in range(
        len(horizontal_lines) - 1
    ):

        top = horizontal_lines[i]
        bottom = horizontal_lines[i + 1]

        row_height = (
            bottom - top
        )

        if row_height < 5:
            continue

        pad = max(
            int(row_height * 0.12),
            1
        )

        y1 = top + pad
        y2 = bottom - pad

        if y2 <= y1:
            continue

        # ====================================================
        # CROP CELLS
        # ====================================================

        commodity_crop = image[
            y1:y2,
            commodity_x1:commodity_x2
        ]

        specification_crop = image[
            y1:y2,
            specification_x1:specification_x2
        ]

        unit_crop = image[
            y1:y2,
            unit_x1:unit_x2
        ]

        price_crop = image[
            y1:y2,
            price_x1:price_x2
        ]

        # ====================================================
        # OCR
        # ====================================================

        commodity = ocr_cell(
            commodity_crop
        )

        specification = ocr_cell(
            specification_crop
        )

        unit = ocr_cell(
            unit_crop
        )

        price_raw, price = ocr_price_cell(
            price_crop
        )

        if (
            not commodity
            and not specification
            and not unit
            and not price_raw
        ):
            continue

        row = {
            "commodity": commodity,
            "specification": specification,
            "unit": unit,
            "price_raw": price_raw,
            "price": price,
            "row_top": top,
            "row_bottom": bottom
        }

        results.append(
            row
        )

        print(
            f"{commodity:<34} | "
            f"{specification:<45} | "
            f"{unit:<10} | "
            f"{price_raw:<15} | "
            f"{price}"
        )

    return results


# ============================================================
# MAIN
# ============================================================

if len(sys.argv) < 2:

    print(
        "\nUsage:"
    )

    print(
        'python price_data\\test_table_ocr.py '
        '"price_data\\pdfs\\2024\\filename.pdf"'
    )

    sys.exit(1)


pdf_path = sys.argv[1]

print(
    "\nTesting table-based OCR:"
)

print(
    pdf_path
)

print(
    "\nConverting PDF to image..."
)


pages = convert_from_path(
    pdf_path,
    dpi=300,
    poppler_path=POPPLER_PATH
)


all_results = []


for page_number, page in enumerate(
    pages
):

    print("\n")
    print("=" * 110)

    print(
        f"PAGE {page_number + 1}"
    )

    print("=" * 110)

    image = cv2.cvtColor(
        np.array(page),
        cv2.COLOR_RGB2BGR
    )

    results = process_table(
        image
    )

    for row in results:

        row["page"] = (
            page_number + 1
        )

    all_results.extend(
        results
    )


# ============================================================
# MATCH TARGET COMMODITIES
# ============================================================

target_results = []


for row in all_results:

    matched_name, match_score = match_target(
        row["commodity"]
    )

    if matched_name is None:
        continue

    row["matched_commodity"] = (
        matched_name
    )

    row["match_score"] = (
        match_score
    )

    target_results.append(
        row
    )


# ============================================================
# PRINT TARGET RESULTS
# ============================================================

print("\n\n")
print("=" * 110)
print("TARGET COMMODITIES")
print("=" * 110)


for row in target_results:

    print()

    print(
        f"OCR Commodity : "
        f"{row['commodity']}"
    )

    print(
        f"Matched As    : "
        f"{row['matched_commodity']}"
    )

    print(
        f"Match Score   : "
        f"{row['match_score']:.2f}"
    )

    print(
        f"Specification : "
        f"{row['specification']}"
    )

    print(
        f"Unit          : "
        f"{row['unit']}"
    )

    print(
        f"Price OCR     : "
        f"{row['price_raw']}"
    )

    if row["price"] is not None:

        print(
            f"Final Price   : "
            f"{row['price']:.2f}"
        )

    else:

        print(
            "Final Price   : None"
        )


# ============================================================
# SUMMARY
# ============================================================

print("\n")
print("=" * 110)
print("SUMMARY")
print("=" * 110)

print(
    f"Total rows extracted : "
    f"{len(all_results)}"
)

print(
    f"Target rows found    : "
    f"{len(target_results)}"
)


# ============================================================
# PRICE REVIEW
# ============================================================

failed_prices = [
    row
    for row in target_results
    if (
        row["price"] is None
        and row["price_raw"]
        .strip()
        .lower()
        not in [
            "n/a",
            "na",
            "n.a."
        ]
    )
]


if failed_prices:

    print("\n")
    print("=" * 110)

    print(
        "TARGET ROWS NEEDING PRICE REVIEW"
    )

    print("=" * 110)

    for row in failed_prices:

        print(
            f"{row['matched_commodity']:<28}"
            f" | OCR commodity: "
            f"{row['commodity']:<25}"
            f" | Price OCR: "
            f"{row['price_raw']}"
        )

else:

    print("\n")
    print("=" * 110)
    print(
        "NO TARGET PRICES NEED MANUAL REVIEW"
    )
    print("=" * 110)