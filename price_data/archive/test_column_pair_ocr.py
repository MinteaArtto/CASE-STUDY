from pdf2image import convert_from_path
import pytesseract
import cv2
import numpy as np
import re
import sys
import os
from difflib import SequenceMatcher


# ============================================================
# WINDOWS CONFIGURATION
# ============================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = r"C:\poppler-26.02.0\Library\bin"


# ============================================================
# DEBUG FOLDER
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DEBUG_DIR = os.path.join(
    BASE_DIR,
    "debug_price_crops"
)

os.makedirs(
    DEBUG_DIR,
    exist_ok=True
)


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
# TEXT CLEANING
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

    text = re.sub(
        r"[^a-z() ]",
        "",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


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

def match_target(ocr_text):

    text = normalize_commodity(
        ocr_text
    )

    if not text:
        return None, 0

    # ========================================================
    # SIMPLE TARGETS
    # ========================================================

    if "ampalaya" in text:
        return "Ampalaya", 1.0

    if "sitao" in text:
        return "Sitao", 1.0

    if "tomato" in text:
        return "Tomato", 1.0

    if "potato" in text:
        return "White Potato", 1.0

    if "ginger" in text:
        return "Ginger", 1.0

    # ========================================================
    # CARROTS
    #
    # Known OCR variants:
    # Carrots
    # Carots
    # Canots
    # Carrols
    # ========================================================

    if (
        "carrot" in text
        or "carots" in text
        or "canots" in text
    ):
        return "Carrots", 0.95

    carrot_tokens = text.split()

    for token in carrot_tokens:

        if (
            5 <= len(token) <= 9
            and (
                token.startswith("car")
                or token.startswith("can")
            )
            and similarity(
                token,
                "carrots"
            ) >= 0.65
        ):
            return "Carrots", 0.85

    # ========================================================
    # SQUASH
    # ========================================================

    if (
        "squash" in text
        or "saquash" in text
    ):
        return "Squash", 0.95

    # ========================================================
    # EGGPLANT
    # ========================================================

    eggplant_variants = [
        "eggplant",
        "eqaolant",
        "egaplant",
        "eqaplant",
    ]

    for variant in eggplant_variants:

        if variant in text:
            return "Eggplant", 0.90

    for token in text.split():

        if (
            len(token) >= 6
            and similarity(
                token,
                "eggplant"
            ) >= 0.72
        ):
            return "Eggplant", 0.80

    # ========================================================
    # PECHAY
    # ========================================================

    if "pechay" in text:

        if "native" in text:
            return "Pechay (Native)", 1.0

        if (
            "baguio" in text
            or "baaquio" in text
            or "baquio" in text
            or "bagu" in text
        ):
            return "Pechay (Baguio)", 0.95

    # ========================================================
    # CABBAGE
    # ========================================================

    cabbage_like = (
        "cabb" in text
        or "cabba" in text
        or "cabbo" in text
    )

    if cabbage_like:

        if "rare" in text:
            return "Cabbage (Rare Ball)", 0.98

        if "scorpio" in text:
            return "Cabbage (Scorpio)", 0.98

        if "wonder" in text:
            return "Cabbage (Wonder Ball)", 0.98

    # ========================================================
    # ONIONS
    # ========================================================

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

    # ========================================================
    # GARLIC
    # ========================================================

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
    # NO MATCH
    # ========================================================

    return None, 0


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def preprocess(
    image,
    scale=2,
    adaptive=False
):

    enlarged = cv2.resize(
        image,
        None,
        fx=scale,
        fy=scale,
        interpolation=cv2.INTER_CUBIC
    )

    gray = cv2.cvtColor(
        enlarged,
        cv2.COLOR_BGR2GRAY
    )

    if adaptive:

        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            11
        )

    else:

        _, binary = cv2.threshold(
            gray,
            0,
            255,
            cv2.THRESH_BINARY
            + cv2.THRESH_OTSU
        )

    return binary


# ============================================================
# REMOVE TABLE LINES
# ============================================================

def remove_table_lines(binary):

    inverted = cv2.bitwise_not(
        binary
    )

    height, width = (
        inverted.shape
    )

    # ========================================================
    # HORIZONTAL LINES
    # ========================================================

    horizontal_kernel = (
        cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (
                max(
                    int(width * 0.55),
                    20
                ),
                1
            )
        )
    )

    horizontal = cv2.morphologyEx(
        inverted,
        cv2.MORPH_OPEN,
        horizontal_kernel
    )

    # ========================================================
    # VERTICAL LINES
    # ========================================================

    vertical_kernel = (
        cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (
                1,
                max(
                    int(height * 0.60),
                    15
                )
            )
        )
    )

    vertical = cv2.morphologyEx(
        inverted,
        cv2.MORPH_OPEN,
        vertical_kernel
    )

    # ========================================================
    # REMOVE LINES
    # ========================================================

    cleaned = cv2.subtract(
        inverted,
        horizontal
    )

    cleaned = cv2.subtract(
        cleaned,
        vertical
    )

    return cv2.bitwise_not(
        cleaned
    )


# ============================================================
# OCR COMMODITY COLUMN
# ============================================================

def ocr_commodity_column(
    image,
    original_y,
    scale=2
):

    processed = preprocess(
        image,
        scale=scale
    )

    data = pytesseract.image_to_data(
        processed,
        config="--psm 6",
        output_type=pytesseract.Output.DATAFRAME
    )

    if data is None:
        return []

    data = data.dropna(
        subset=["text"]
    )

    rows = {}

    for _, word in data.iterrows():

        text = clean_text(
            word["text"]
        )

        if not text:
            continue

        try:

            confidence = float(
                word["conf"]
            )

        except Exception:

            confidence = -1

        if confidence < 10:
            continue

        key = (
            int(word["block_num"]),
            int(word["par_num"]),
            int(word["line_num"])
        )

        top = (
            float(word["top"])
            / scale
        )

        word_height = (
            float(word["height"])
            / scale
        )

        page_top = (
            original_y
            + top
        )

        page_bottom = (
            page_top
            + word_height
        )

        if key not in rows:

            rows[key] = {
                "words": [],
                "tops": [],
                "bottoms": [],
            }

        rows[key]["words"].append(
            text
        )

        rows[key]["tops"].append(
            page_top
        )

        rows[key]["bottoms"].append(
            page_bottom
        )

    results = []

    for row in rows.values():

        text = clean_text(
            " ".join(
                row["words"]
            )
        )

        if not text:
            continue

        top = min(
            row["tops"]
        )

        bottom = max(
            row["bottoms"]
        )

        center_y = (
            top + bottom
        ) / 2

        results.append({
            "text": text,
            "top": top,
            "bottom": bottom,
            "center_y": center_y,
        })

    results.sort(
        key=lambda item:
            item["center_y"]
    )

    return results


# ============================================================
# EXTRACT VALID PRICE
# ============================================================

def extract_price_candidate(text):

    if not text:
        return None

    text = clean_text(
        text
    )

    text = text.replace(
        ",",
        "."
    )

    text = text.replace(
        "O",
        "0"
    )

    text = text.replace(
        "o",
        "0"
    )

    matches = re.findall(
        r"\d{1,4}\.\d{2}",
        text
    )

    if not matches:
        return None

    try:

        value = float(
            matches[-1]
        )

    except ValueError:

        return None

    if value <= 0:
        return None

    if value > 1000:
        return None

    return round(
        value,
        2
    )


# ============================================================
# CHOOSE PRICE USING CONSENSUS
# ============================================================

def choose_price_from_attempts(
    attempts
):

    candidates = []

    for attempt in attempts:

        value = (
            extract_price_candidate(
                attempt["text"]
            )
        )

        if value is None:
            continue

        candidates.append({
            "label":
                attempt["label"],

            "family":
                attempt["family"],

            "text":
                attempt["text"],

            "value":
                value,
        })

    if not candidates:

        return None, ""

    # ========================================================
    # DIAGNOSTIC STRING
    # ========================================================

    diagnostic = " | ".join(
        (
            f"{item['label']}="
            f"{item['text']}"
        )
        for item in candidates
    )

    # ========================================================
    # GROUP BY PRICE
    # ========================================================

    groups = {}

    for item in candidates:

        value = item[
            "value"
        ]

        if value not in groups:

            groups[value] = {
                "items": [],
                "families": set(),
            }

        groups[
            value
        ]["items"].append(
            item
        )

        groups[
            value
        ]["families"].add(
            item["family"]
        )

    # ========================================================
    # DROPPED FIRST DIGIT CHECK
    #
    # Example:
    #
    # 14.17
    # 114.17
    # ========================================================

    values = list(
        groups.keys()
    )

    for longer in values:

        longer_string = (
            f"{longer:.2f}"
        )

        for shorter in values:

            if longer == shorter:
                continue

            shorter_string = (
                f"{shorter:.2f}"
            )

            if (
                len(longer_string)
                <= len(shorter_string)
            ):
                continue

            if not longer_string.endswith(
                shorter_string
            ):
                continue

            longer_families = len(
                groups[
                    longer
                ]["families"]
            )

            shorter_families = len(
                groups[
                    shorter
                ]["families"]
            )

            if (
                longer_families >= 2
                and shorter_families <= 1
            ):

                return (
                    longer,
                    diagnostic
                )

    # ========================================================
    # CROSS-FAMILY CONSENSUS
    # ========================================================

    supported = []

    for value, group in (
        groups.items()
    ):

        family_count = len(
            group["families"]
        )

        occurrence_count = len(
            group["items"]
        )

        if family_count >= 2:

            supported.append({
                "value":
                    value,

                "families":
                    family_count,

                "occurrences":
                    occurrence_count,
            })

    if supported:

        supported.sort(
            key=lambda item: (
                item["families"],
                item["occurrences"]
            ),
            reverse=True
        )

        if len(supported) >= 2:

            first = supported[0]
            second = supported[1]

            if (
                first["families"]
                == second["families"]
                and first["occurrences"]
                == second["occurrences"]
            ):

                return (
                    None,
                    diagnostic
                )

        return (
            supported[0]["value"],
            diagnostic
        )

    return None, diagnostic


# ============================================================
# OCR PRICE STRIP
# ============================================================

def ocr_price_strip(
    image,
    commodity_row,
    matched_name,
    debug_index
):

    height, width, _ = (
        image.shape
    )

    # ========================================================
    # PRICE COLUMN
    # ========================================================

    x1 = int(
        width * 0.695
    )

    x2 = int(
        width * 0.805
    )

    # ========================================================
    # COMMODITY ROW POSITION
    # ========================================================

    row_top = int(
        commodity_row[
            "top"
        ]
    )

    row_bottom = int(
        commodity_row[
            "bottom"
        ]
    )

    margin_y = max(
        int(
            height * 0.003
        ),
        6
    )

    y1 = max(
        row_top
        - margin_y,
        0
    )

    y2 = min(
        row_bottom
        + margin_y,
        height
    )

    crop = image[
        y1:y2,
        x1:x2
    ]

    if crop.size == 0:

        return "", None

    # ========================================================
    # SAVE ORIGINAL CROP
    # ========================================================

    safe_name = re.sub(
        r"[^A-Za-z0-9]+",
        "_",
        matched_name
    ).strip("_")

    original_path = (
        os.path.join(
            DEBUG_DIR,
            f"{debug_index:02d}_"
            f"{safe_name}_original.png"
        )
    )

    cv2.imwrite(
        original_path,
        crop
    )

    # ========================================================
    # OCR ATTEMPTS
    # ========================================================

    attempts = []

    psm_modes = [
        6,
        7
    ]

    scales = [
        2,
        3,
        4,
        5,
        6
    ]

    for scale in scales:

        enlarged = cv2.resize(
            crop,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_CUBIC
        )

        gray = cv2.cvtColor(
            enlarged,
            cv2.COLOR_BGR2GRAY
        )

        # ====================================================
        # FAMILY 1: GRAYSCALE
        # ====================================================

        for psm in psm_modes:

            text = (
                pytesseract
                .image_to_string(
                    gray,
                    config=(
                        f"--psm {psm} "
                        "-c "
                        "tessedit_char_whitelist="
                        "0123456789."
                    )
                )
            )

            text = clean_text(
                text
            )

            attempts.append({
                "label":
                    f"gray_s{scale}_p{psm}",

                "family":
                    "gray",

                "text":
                    text,
            })

        # ====================================================
        # OTSU
        # ====================================================

        _, otsu = cv2.threshold(
            gray,
            0,
            255,
            cv2.THRESH_BINARY
            + cv2.THRESH_OTSU
        )

        # ====================================================
        # FAMILY 2: RAW OTSU
        # ====================================================

        for psm in psm_modes:

            text = (
                pytesseract
                .image_to_string(
                    otsu,
                    config=(
                        f"--psm {psm} "
                        "-c "
                        "tessedit_char_whitelist="
                        "0123456789."
                    )
                )
            )

            text = clean_text(
                text
            )

            attempts.append({
                "label":
                    f"otsuraw_s{scale}_p{psm}",

                "family":
                    "otsu_raw",

                "text":
                    text,
            })

        # ====================================================
        # CLEANED OTSU
        # ====================================================

        otsu_clean = (
            remove_table_lines(
                otsu
            )
        )

        # ====================================================
        # FAMILY 3: CLEANED OTSU
        # ====================================================

        for psm in psm_modes:

            text = (
                pytesseract
                .image_to_string(
                    otsu_clean,
                    config=(
                        f"--psm {psm} "
                        "-c "
                        "tessedit_char_whitelist="
                        "0123456789."
                    )
                )
            )

            text = clean_text(
                text
            )

            attempts.append({
                "label":
                    f"otsuclean_s{scale}_p{psm}",

                "family":
                    "otsu_clean",

                "text":
                    text,
            })

        # ====================================================
        # ADAPTIVE THRESHOLD
        # ====================================================

        adaptive = (
            cv2.adaptiveThreshold(
                gray,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                31,
                11
            )
        )

        # ====================================================
        # FAMILY 4: RAW ADAPTIVE
        # ====================================================

        for psm in psm_modes:

            text = (
                pytesseract
                .image_to_string(
                    adaptive,
                    config=(
                        f"--psm {psm} "
                        "-c "
                        "tessedit_char_whitelist="
                        "0123456789."
                    )
                )
            )

            text = clean_text(
                text
            )

            attempts.append({
                "label":
                    f"adaptiveraw_s{scale}_p{psm}",

                "family":
                    "adaptive_raw",

                "text":
                    text,
            })

        # ====================================================
        # CLEANED ADAPTIVE
        # ====================================================

        adaptive_clean = (
            remove_table_lines(
                adaptive
            )
        )

        # ====================================================
        # FAMILY 5: CLEANED ADAPTIVE
        # ====================================================

        for psm in psm_modes:

            text = (
                pytesseract
                .image_to_string(
                    adaptive_clean,
                    config=(
                        f"--psm {psm} "
                        "-c "
                        "tessedit_char_whitelist="
                        "0123456789."
                    )
                )
            )

            text = clean_text(
                text
            )

            attempts.append({
                "label":
                    f"adaptiveclean_s{scale}_p{psm}",

                "family":
                    "adaptive_clean",

                "text":
                    text,
            })

    # ========================================================
    # CONSENSUS
    # ========================================================

    price, diagnostic = (
        choose_price_from_attempts(
            attempts
        )
    )

    # ========================================================
    # SAVE PROCESSED CROP
    # ========================================================

    sample = cv2.resize(
        crop,
        None,
        fx=4,
        fy=4,
        interpolation=cv2.INTER_CUBIC
    )

    sample_gray = (
        cv2.cvtColor(
            sample,
            cv2.COLOR_BGR2GRAY
        )
    )

    _, sample_binary = (
        cv2.threshold(
            sample_gray,
            0,
            255,
            cv2.THRESH_BINARY
            + cv2.THRESH_OTSU
        )
    )

    processed_path = (
        os.path.join(
            DEBUG_DIR,
            f"{debug_index:02d}_"
            f"{safe_name}_processed.png"
        )
    )

    cv2.imwrite(
        processed_path,
        sample_binary
    )

    return (
        diagnostic,
        price
    )


# ============================================================
# PROCESS ONE PAGE
# ============================================================

def process_page(image):

    height, width, _ = (
        image.shape
    )

    print()

    print(
        f"Image size: "
        f"{width} x {height}"
    )

    # ========================================================
    # COMMODITY COLUMN
    # ========================================================

    commodity_x1 = int(
        width * 0.005
    )

    commodity_x2 = int(
        width * 0.350
    )

    y1 = int(
        height * 0.05
    )

    y2 = int(
        height * 0.95
    )

    commodity_crop = image[
        y1:y2,
        commodity_x1:commodity_x2
    ]

    print(
        "OCRing commodity column..."
    )

    commodity_rows = (
        ocr_commodity_column(
            commodity_crop,
            original_y=y1,
            scale=2
        )
    )

    print()

    print(
        f"Commodity lines detected: "
        f"{len(commodity_rows)}"
    )

    # ========================================================
    # DEBUG CARROTS AREA
    #
    # This MUST be inside process_page(), because
    # commodity_rows only exists here.
    # ========================================================

    print()

    print(
        "=" * 100
    )

    print(
        "COMMODITY OCR AROUND CARROTS"
    )

    print(
        "=" * 100
    )

    for row in commodity_rows:

        if (
            1990
            <= row["center_y"]
            <= 2100
        ):

            print(
                f"Y={row['center_y']:.1f} "
                f"| OCR: "
                f"{row['text']}"
            )

    # ========================================================
    # MATCH TARGET COMMODITIES
    # ========================================================

    targets = []

    seen = set()

    for row in commodity_rows:

        # Ignore OCR noise near bottom
        if (
            row["center_y"]
            > height * 0.92
        ):
            continue

        matched, score = (
            match_target(
                row["text"]
            )
        )

        if matched is None:
            continue

        if matched in seen:
            continue

        seen.add(
            matched
        )

        targets.append({
            "commodity":
                matched,

            "ocr_commodity":
                row["text"],

            "match_score":
                score,

            "row":
                row,
        })

    print()

    print(
        f"Target commodity rows detected: "
        f"{len(targets)}"
    )

    # ========================================================
    # OCR PRICES
    # ========================================================

    print()

    print(
        "OCRing price strips..."
    )

    results = []

    for index, target in enumerate(
        targets,
        start=1
    ):

        price_raw, price = (
            ocr_price_strip(
                image,
                target["row"],
                target["commodity"],
                index
            )
        )

        results.append({
            "commodity":
                target["commodity"],

            "ocr_commodity":
                target[
                    "ocr_commodity"
                ],

            "match_score":
                target[
                    "match_score"
                ],

            "commodity_y":
                target["row"][
                    "center_y"
                ],

            "price_raw":
                price_raw,

            "price":
                price,
        })

    # ========================================================
    # PRINT RESULTS
    # ========================================================

    print()

    print(
        "=" * 100
    )

    print(
        "TARGET COMMODITIES"
    )

    print(
        "=" * 100
    )

    for result in results:

        print()

        print(
            f"Matched As    : "
            f"{result['commodity']}"
        )

        print(
            f"OCR Commodity : "
            f"{result['ocr_commodity']}"
        )

        print(
            f"Match Score   : "
            f"{result['match_score']:.2f}"
        )

        print(
            f"Commodity Y   : "
            f"{result['commodity_y']:.1f}"
        )

        print(
            f"Price OCR     : "
            f"{result['price_raw']}"
        )

        if (
            result["price"]
            is not None
        ):

            print(
                f"Final Price   : "
                f"{result['price']:.2f}"
            )

        else:

            print(
                "Final Price   : None"
            )

    # ========================================================
    # SUMMARY
    # ========================================================

    successful = [
        row
        for row in results
        if row["price"] is not None
    ]

    failed = [
        row
        for row in results
        if row["price"] is None
    ]

    print()

    print(
        "=" * 100
    )

    print(
        "SUMMARY"
    )

    print(
        "=" * 100
    )

    print(
        f"Commodity lines detected : "
        f"{len(commodity_rows)}"
    )

    print(
        f"Target rows found        : "
        f"{len(results)}"
    )

    print(
        f"Prices extracted         : "
        f"{len(successful)}"
    )

    print(
        f"Prices not extracted     : "
        f"{len(failed)}"
    )

    # ========================================================
    # FAILED PRICES
    # ========================================================

    if failed:

        print()

        print(
            "=" * 100
        )

        print(
            "FAILED PRICE ROWS"
        )

        print(
            "=" * 100
        )

        for row in failed:

            print(
                f"{row['commodity']:<28}"
                f" | OCR: "
                f"{row['price_raw']}"
            )

    else:

        print()

        print(
            "=" * 100
        )

        print(
            "ALL DETECTED TARGET "
            "PRICES PASSED CONSENSUS"
        )

        print(
            "=" * 100
        )

    # ========================================================
    # MISSING TARGETS
    # ========================================================

    detected = {
        row["commodity"]
        for row in results
    }

    missing = [
        target
        for target
        in TARGET_COMMODITIES
        if target not in detected
    ]

    if missing:

        print()

        print(
            "=" * 100
        )

        print(
            "TARGET COMMODITIES NOT DETECTED"
        )

        print(
            "=" * 100
        )

        for target in missing:

            print(
                target
            )

    # ========================================================
    # DEBUG DIRECTORY
    # ========================================================

    print()

    print(
        "Debug price crops saved to:"
    )

    print(
        DEBUG_DIR
    )


# ============================================================
# MAIN
# ============================================================

if len(sys.argv) < 2:

    print()

    print(
        "Usage:"
    )

    print(
        'python '
        'price_data\\test_column_pair_ocr.py '
        '"price_data\\pdfs\\2024\\filename.pdf"'
    )

    sys.exit(1)


pdf_path = sys.argv[1]


print()

print(
    "=" * 100
)

print(
    "ROW-ALIGNED PRICE OCR TEST"
)

print(
    "=" * 100
)

print(
    f"\nPDF:\n{pdf_path}"
)

print(
    "\nConverting first page "
    "at 300 DPI..."
)


pages = convert_from_path(
    pdf_path,
    dpi=300,
    first_page=1,
    last_page=1,
    poppler_path=POPPLER_PATH
)


if not pages:

    print(
        "No pages were converted."
    )

    sys.exit(1)


image = cv2.cvtColor(
    np.array(
        pages[0]
    ),
    cv2.COLOR_RGB2BGR
)


process_page(
    image
)