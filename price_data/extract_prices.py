import os
import re
import csv
from datetime import datetime
from collections import Counter

import cv2
import numpy as np
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from difflib import SequenceMatcher


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

PDF_ROOT = os.path.join(
    BASE_DIR,
    "pdfs"
)

OUTPUT_CSV = os.path.join(
    BASE_DIR,
    "price_dataset_hybrid_v2.csv"
)

LOG_CSV = os.path.join(
    BASE_DIR,
    "price_extraction_log_v2.csv"
)


pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = (
    r"C:\poppler-26.02.0\Library\bin"
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
# MONTHS
# ============================================================

MONTHS = {
    "January": 1,
    "February": 2,
    "March": 3,
    "April": 4,
    "May": 5,
    "June": 6,
    "July": 7,
    "August": 8,
    "September": 9,
    "October": 10,
    "November": 11,
    "December": 12,
}


# ============================================================
# BASIC TEXT CLEANING
# ============================================================

def clean_text(text):

    if text is None:
        return ""

    text = str(text)

    text = text.replace(
        "\n",
        " "
    )

    text = text.replace(
        "|",
        " "
    )

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

    text = str(text).lower()

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
# MATCH ONE OCR COMMODITY
# ============================================================

def match_target(ocr_text):

    text = normalize_commodity(
        ocr_text
    )

    if not text:
        return None, 0

    # --------------------------------------------------------
    # SIMPLE TARGETS
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # CARROTS
    #
    # Known OCR example:
    # Canots
    # --------------------------------------------------------

    if (
        "carrot" in text
        or "carots" in text
        or "canots" in text
    ):
        return "Carrots", 0.95

    for token in text.split():

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

    # --------------------------------------------------------
    # SQUASH
    # --------------------------------------------------------

    if (
        "squash" in text
        or "saquash" in text
    ):
        return "Squash", 0.95

    # --------------------------------------------------------
    # EGGPLANT
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # PECHAY
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # CABBAGE
    # --------------------------------------------------------

    cabbage_like = (
        "cabb" in text
        or "cabba" in text
        or "cabbo" in text
    )

    if cabbage_like:

        if "rare" in text:
            return (
                "Cabbage (Rare Ball)",
                0.98
            )

        if "scorpio" in text:
            return (
                "Cabbage (Scorpio)",
                0.98
            )

        if "wonder" in text:
            return (
                "Cabbage (Wonder Ball)",
                0.98
            )

    # --------------------------------------------------------
    # ONIONS
    # --------------------------------------------------------

    if "onion" in text:

        imported = (
            "imported" in text
        )

        if "red" in text:

            if imported:
                return (
                    "Red Onion (Imported)",
                    1.0
                )

            return "Red Onion", 1.0

        if "white" in text:

            if imported:
                return (
                    "White Onion (Imported)",
                    1.0
                )

            return "White Onion", 1.0

    # --------------------------------------------------------
    # GARLIC
    # --------------------------------------------------------

    garlic_like = (
        "garlic" in text
        or "gariic" in text
        or "garic" in text
    )

    if garlic_like:

        if "imported" in text:
            return (
                "Garlic (Imported)",
                0.98
            )

        if (
            "native" in text
            or "local" in text
        ):
            return (
                "Garlic (Native)",
                0.98
            )

    return None, 0


# ============================================================
# DETECT ALL TARGETS IN A TEXT LINE
#
# Used for pdfplumber.
#
# This helps us detect malformed text extraction such as:
#
# Red Onion (Imported) ... White Onion ...
#
# If a line contains multiple target commodities, we treat
# it as ambiguous instead of assigning the last price to
# the wrong commodity.
# ============================================================

def detect_targets_in_line(text):

    normalized = normalize_commodity(
        text
    )

    found = []

    # --------------------------------------------------------
    # SIMPLE TARGETS
    # --------------------------------------------------------

    if "ampalaya" in normalized:
        found.append("Ampalaya")

    if "sitao" in normalized:
        found.append("Sitao")

    if "squash" in normalized:
        found.append("Squash")

    if "eggplant" in normalized:
        found.append("Eggplant")

    if "tomato" in normalized:
        found.append("Tomato")

    if "carrot" in normalized:
        found.append("Carrots")

    if "white potato" in normalized:
        found.append("White Potato")

    if "ginger" in normalized:
        found.append("Ginger")

    # --------------------------------------------------------
    # PECHAY
    # --------------------------------------------------------

    if "pechay" in normalized:

        if "native" in normalized:
            found.append(
                "Pechay (Native)"
            )

        if (
            "baguio" in normalized
            or "baquio" in normalized
            or "baaquio" in normalized
        ):
            found.append(
                "Pechay (Baguio)"
            )

    # --------------------------------------------------------
    # CABBAGE
    # --------------------------------------------------------

    if (
        "cabbage" in normalized
        or "cabbacge" in normalized
        or "cabbaae" in normalized
        or "cabbooe" in normalized
    ):

        if "rare" in normalized:
            found.append(
                "Cabbage (Rare Ball)"
            )

        if "scorpio" in normalized:
            found.append(
                "Cabbage (Scorpio)"
            )

        if "wonder" in normalized:
            found.append(
                "Cabbage (Wonder Ball)"
            )

    # --------------------------------------------------------
    # ONIONS
    # --------------------------------------------------------

    if "red onion" in normalized:

        if (
            "red onion imported"
            in normalized
            or "red onion (imported)"
            in normalized
        ):
            found.append(
                "Red Onion (Imported)"
            )

        else:
            found.append(
                "Red Onion"
            )

    if "white onion" in normalized:

        if (
            "white onion imported"
            in normalized
            or "white onion (imported)"
            in normalized
        ):
            found.append(
                "White Onion (Imported)"
            )

        else:
            found.append(
                "White Onion"
            )

    # --------------------------------------------------------
    # GARLIC
    # --------------------------------------------------------

    if "garlic" in normalized:

        if "imported" in normalized:
            found.append(
                "Garlic (Imported)"
            )

        if (
            "native" in normalized
            or "local" in normalized
        ):
            found.append(
                "Garlic (Native)"
            )

    # --------------------------------------------------------
    # REMOVE DUPLICATES
    # --------------------------------------------------------

    unique = []

    for item in found:

        if item not in unique:
            unique.append(item)

    return unique


# ============================================================
# PRICE EXTRACTION
# ============================================================

def extract_price_candidate(text):

    if not text:
        return None

    text = clean_text(
        text
    )

    lowered = text.lower()

    if (
        "n/a" in lowered
        or lowered == "na"
    ):
        return None

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

    # Our target vegetable/spice prices should not
    # realistically be in the thousands.
    if value > 1000:
        return None

    return round(
        value,
        2
    )


# ============================================================
# CONSENSUS PRICE
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
            "family":
                attempt["family"],

            "text":
                attempt["text"],

            "value":
                value,
        })

    if not candidates:

        return None, 0

    groups = {}

    for item in candidates:

        value = item[
            "value"
        ]

        if value not in groups:

            groups[value] = {
                "families": set(),
                "count": 0,
            }

        groups[
            value
        ]["families"].add(
            item["family"]
        )

        groups[
            value
        ]["count"] += 1

    # --------------------------------------------------------
    # DROPPED LEADING DIGIT
    #
    # Example:
    # 14.17 versus 114.17
    # --------------------------------------------------------

    values = list(
        groups.keys()
    )

    for longer in values:

        longer_text = (
            f"{longer:.2f}"
        )

        for shorter in values:

            if longer == shorter:
                continue

            shorter_text = (
                f"{shorter:.2f}"
            )

            if (
                len(longer_text)
                > len(shorter_text)
                and longer_text.endswith(
                    shorter_text
                )
            ):

                longer_support = len(
                    groups[
                        longer
                    ]["families"]
                )

                shorter_support = len(
                    groups[
                        shorter
                    ]["families"]
                )

                if (
                    longer_support >= 2
                    and shorter_support <= 1
                ):

                    return (
                        longer,
                        longer_support
                    )

    # --------------------------------------------------------
    # CROSS-FAMILY AGREEMENT
    # --------------------------------------------------------

    supported = []

    for value, group in (
        groups.items()
    ):

        family_count = len(
            group["families"]
        )

        if family_count >= 2:

            supported.append({
                "value":
                    value,

                "families":
                    family_count,

                "count":
                    group["count"],
            })

    if not supported:
        return None, 0

    supported.sort(
        key=lambda item: (
            item["families"],
            item["count"]
        ),
        reverse=True
    )

    # If two different values have exactly
    # equal support, do not guess.
    if len(supported) >= 2:

        first = supported[0]
        second = supported[1]

        if (
            first["families"]
            == second["families"]
            and first["count"]
            == second["count"]
        ):

            return None, 0

    return (
        supported[0]["value"],
        supported[0]["families"]
    )


# ============================================================
# DATE EXTRACTION FROM FILENAME
# ============================================================

def extract_week_from_filename(
    filename
):

    name = os.path.splitext(
        os.path.basename(
            filename
        )
    )[0]

    # Handles both:
    #
    # Weekly-Average-Prices-...
    # Weekly-Average-Price-...
    #
    name = re.sub(
        r"^Weekly-Average-Prices?-",
        "",
        name,
        flags=re.IGNORECASE
    )

    parts = name.split("-")

    # --------------------------------------------------------
    # SAME MONTH
    #
    # August-17-23-2026
    # --------------------------------------------------------

    if (
        len(parts) == 4
        and parts[0] in MONTHS
    ):

        try:

            month = MONTHS[
                parts[0]
            ]

            start_day = int(
                parts[1]
            )

            end_day = int(
                parts[2]
            )

            year = int(
                parts[3]
            )

            start = datetime(
                year,
                month,
                start_day
            )

            end = datetime(
                year,
                month,
                end_day
            )

            return (
                start.strftime(
                    "%Y-%m-%d"
                ),
                end.strftime(
                    "%Y-%m-%d"
                )
            )

        except ValueError:
            return None, None

    # --------------------------------------------------------
    # CROSS MONTH
    #
    # April-29-May-4-2024
    # --------------------------------------------------------

    if (
        len(parts) == 5
        and parts[0] in MONTHS
        and parts[2] in MONTHS
    ):

        try:

            start = datetime(
                int(parts[4]),
                MONTHS[
                    parts[0]
                ],
                int(parts[1])
            )

            end = datetime(
                int(parts[4]),
                MONTHS[
                    parts[2]
                ],
                int(parts[3])
            )

            return (
                start.strftime(
                    "%Y-%m-%d"
                ),
                end.strftime(
                    "%Y-%m-%d"
                )
            )

        except ValueError:
            return None, None

    # --------------------------------------------------------
    # CROSS YEAR
    #
    # December-30-2024-January-4-2025
    # --------------------------------------------------------

    if (
        len(parts) == 6
        and parts[0] in MONTHS
        and parts[3] in MONTHS
    ):

        try:

            start = datetime(
                int(parts[2]),
                MONTHS[
                    parts[0]
                ],
                int(parts[1])
            )

            end = datetime(
                int(parts[5]),
                MONTHS[
                    parts[3]
                ],
                int(parts[4])
            )

            return (
                start.strftime(
                    "%Y-%m-%d"
                ),
                end.strftime(
                    "%Y-%m-%d"
                )
            )

        except ValueError:
            return None, None

    return None, None


# ============================================================
# FIND ALL PDFs
# ============================================================

def find_pdf_files(root):

    pdf_files = []

    for folder, _, files in os.walk(
        root
    ):

        for filename in files:

            if filename.lower().endswith(
                ".pdf"
            ):

                pdf_files.append(
                    os.path.join(
                        folder,
                        filename
                    )
                )

    return sorted(
        pdf_files
    )


# ============================================================
# PDFPLUMBER TEXT EXTRACTION
# ============================================================

def extract_pdf_text(
    pdf_path
):

    texts = []

    try:

        with pdfplumber.open(
            pdf_path
        ) as pdf:

            for page in pdf.pages:

                text = (
                    page.extract_text()
                )

                if text:
                    texts.append(
                        text
                    )

    except Exception as error:

        print(
            f"  pdfplumber error: "
            f"{error}"
        )

    return "\n".join(
        texts
    )


# ============================================================
# PARSE TEXT PDF
# ============================================================

def parse_text_pdf(
    text,
    week_start,
    week_end,
    source_file
):

    records = []

    detected_targets = set()

    ambiguous_lines = 0

    for raw_line in text.splitlines():

        line = clean_text(
            raw_line
        )

        if not line:
            continue

        targets = (
            detect_targets_in_line(
                line
            )
        )

        if not targets:
            continue

        # ----------------------------------------------------
        # MORE THAN ONE TARGET IN SAME TEXT LINE
        #
        # Unsafe because pdfplumber probably merged rows.
        # ----------------------------------------------------

        if len(targets) > 1:

            ambiguous_lines += 1

            continue

        commodity = targets[0]

        detected_targets.add(
            commodity
        )

        price = (
            extract_price_candidate(
                line
            )
        )

        # n/a / missing price
        if price is None:
            continue

        records.append({
            "week_start":
                week_start,

            "week_end":
                week_end,

            "commodity":
                commodity,

            "raw_item":
                line,

            "specification":
                "",

            "unit":
                "kg",

            "raw_unit":
                "",

            "weekly_average_price":
                price,

            "price_support_families":
                "",

            "extraction_method":
                "pdfplumber",

            "source_file":
                source_file,
        })

    return (
        records,
        detected_targets,
        ambiguous_lines
    )


# ============================================================
# GENERAL IMAGE PREPROCESSING
# ============================================================

def preprocess_image(
    image,
    scale=2
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

    horizontal_kernel = (
        cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (
                max(
                    int(
                        width * 0.55
                    ),
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

    vertical_kernel = (
        cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (
                1,
                max(
                    int(
                        height * 0.60
                    ),
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
# OCR NORMAL TEXT CELL
# ============================================================

def ocr_text_cell(
    image,
    psm=7,
    scale=2
):

    if image is None:
        return ""

    if image.size == 0:
        return ""

    processed = preprocess_image(
        image,
        scale=scale
    )

    text = (
        pytesseract
        .image_to_string(
            processed,
            config=f"--psm {psm}"
        )
    )

    return clean_text(
        text
    )


# ============================================================
# OCR PRICE CROP
#
# FAST VERSION FOR BATCH EXTRACTION.
#
# The individual test used many scales to diagnose OCR.
# For the batch run we first use the combinations that
# successfully handled all 19 rows in the tested hard PDF.
# ============================================================

def ocr_price_crop(
    crop
):

    if crop is None:
        return None, 0

    if crop.size == 0:
        return None, 0

    attempts = []

    # --------------------------------------------------------
    # SCALE 2
    # --------------------------------------------------------

    enlarged = cv2.resize(
        crop,
        None,
        fx=2,
        fy=2,
        interpolation=cv2.INTER_CUBIC
    )

    gray = cv2.cvtColor(
        enlarged,
        cv2.COLOR_BGR2GRAY
    )

    # --------------------------------------------------------
    # FAMILY 1 - GRAYSCALE
    # --------------------------------------------------------

    text = (
        pytesseract
        .image_to_string(
            gray,
            config=(
                "--psm 6 "
                "-c "
                "tessedit_char_whitelist="
                "0123456789."
            )
        )
    )

    attempts.append({
        "family":
            "gray",

        "text":
            clean_text(text)
    })

    # --------------------------------------------------------
    # OTSU
    # --------------------------------------------------------

    _, otsu = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY
        + cv2.THRESH_OTSU
    )

    # --------------------------------------------------------
    # FAMILY 2 - RAW OTSU
    # --------------------------------------------------------

    text = (
        pytesseract
        .image_to_string(
            otsu,
            config=(
                "--psm 6 "
                "-c "
                "tessedit_char_whitelist="
                "0123456789."
            )
        )
    )

    attempts.append({
        "family":
            "otsu_raw",

        "text":
            clean_text(text)
    })

    # --------------------------------------------------------
    # FAMILY 3 - RAW ADAPTIVE
    # --------------------------------------------------------

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

    text = (
        pytesseract
        .image_to_string(
            adaptive,
            config=(
                "--psm 6 "
                "-c "
                "tessedit_char_whitelist="
                "0123456789."
            )
        )
    )

    attempts.append({
        "family":
            "adaptive_raw",

        "text":
            clean_text(text)
    })

    # --------------------------------------------------------
    # FIRST CONSENSUS
    # --------------------------------------------------------

    price, support = (
        choose_price_from_attempts(
            attempts
        )
    )

    if price is not None:

        return (
            price,
            support
        )

    # ========================================================
    # EXTRA ATTEMPTS ONLY IF NECESSARY
    # ========================================================

    otsu_clean = remove_table_lines(
        otsu
    )

    text = (
        pytesseract
        .image_to_string(
            otsu_clean,
            config=(
                "--psm 6 "
                "-c "
                "tessedit_char_whitelist="
                "0123456789."
            )
        )
    )

    attempts.append({
        "family":
            "otsu_clean",

        "text":
            clean_text(text)
    })

    adaptive_clean = (
        remove_table_lines(
            adaptive
        )
    )

    text = (
        pytesseract
        .image_to_string(
            adaptive_clean,
            config=(
                "--psm 6 "
                "-c "
                "tessedit_char_whitelist="
                "0123456789."
            )
        )
    )

    attempts.append({
        "family":
            "adaptive_clean",

        "text":
            clean_text(text)
    })

    # --------------------------------------------------------
    # SCALE 3 GRAYSCALE
    # --------------------------------------------------------

    enlarged3 = cv2.resize(
        crop,
        None,
        fx=3,
        fy=3,
        interpolation=cv2.INTER_CUBIC
    )

    gray3 = cv2.cvtColor(
        enlarged3,
        cv2.COLOR_BGR2GRAY
    )

    text = (
        pytesseract
        .image_to_string(
            gray3,
            config=(
                "--psm 6 "
                "-c "
                "tessedit_char_whitelist="
                "0123456789."
            )
        )
    )

    attempts.append({
        "family":
            "gray",

        "text":
            clean_text(text)
    })

    return choose_price_from_attempts(
        attempts
    )


# ============================================================
# PRICE COLUMN PROFILES
#
# We discovered two main scanned layouts.
#
# Wide page:
#   December 16-21 test
#   2480 x 3509
#   price approximately 69.5%-80.5%
#
# Narrow/cropped page:
#   August 26-31 test
#   1591 x 3511
#   price approximately 75.5%-99%
# ============================================================

def get_price_profiles(
    width,
    height
):

    aspect_ratio = (
        width / height
    )

    if aspect_ratio < 0.62:

        return [
            (
                0.755,
                0.990
            ),
            (
                0.695,
                0.820
            ),
        ]

    return [
        (
            0.695,
            0.805
        ),
        (
            0.755,
            0.990
        ),
    ]


# ============================================================
# FIND HORIZONTAL TABLE LINES
# ============================================================

def find_horizontal_lines(
    image
):

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

    height, width = (
        binary.shape
    )

    kernel_width = max(
        int(
            width * 0.25
        ),
        30
    )

    horizontal_kernel = (
        cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (
                kernel_width,
                1
            )
        )
    )

    horizontal = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        horizontal_kernel
    )

    contours, _ = (
        cv2.findContours(
            horizontal,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
    )

    lines = []

    for contour in contours:

        x, y, w, h = (
            cv2.boundingRect(
                contour
            )
        )

        if w > width * 0.60:

            lines.append(
                y
            )

    lines = sorted(
        lines
    )

    merged = []

    tolerance = max(
        int(
            height * 0.002
        ),
        3
    )

    for y in lines:

        if not merged:

            merged.append(
                y
            )

        elif (
            y
            - merged[-1]
            > tolerance
        ):

            merged.append(
                y
            )

    return merged


# ============================================================
# TABLE-ROW OCR
#
# Best suited to narrow / clearly ruled scanned layouts.
# ============================================================

def table_ocr_page(
    image,
    week_start,
    week_end,
    source_file
):

    records = []

    detected = set()

    seen = set()

    height, width, _ = (
        image.shape
    )

    lines = find_horizontal_lines(
        image
    )

    if len(lines) < 10:

        return (
            records,
            detected
        )

    commodity_x1 = int(
        width * 0.005
    )

    commodity_x2 = int(
        width * 0.350
    )

    price_profiles = (
        get_price_profiles(
            width,
            height
        )
    )

    primary_price_profile = (
        price_profiles[0]
    )

    price_x1 = int(
        width
        * primary_price_profile[0]
    )

    price_x2 = int(
        width
        * primary_price_profile[1]
    )

    for index in range(
        len(lines) - 1
    ):

        top = lines[index]
        bottom = lines[index + 1]

        row_height = (
            bottom - top
        )

        if row_height < 5:
            continue

        pad = max(
            int(
                row_height * 0.12
            ),
            1
        )

        y1 = top + pad
        y2 = bottom - pad

        if y2 <= y1:
            continue

        commodity_crop = image[
            y1:y2,
            commodity_x1:commodity_x2
        ]

        commodity_raw = (
            ocr_text_cell(
                commodity_crop,
                psm=7,
                scale=2
            )
        )

        commodity, score = (
            match_target(
                commodity_raw
            )
        )

        if commodity is None:
            continue

        if commodity in seen:
            continue

        seen.add(
            commodity
        )

        detected.add(
            commodity
        )

        price_crop = image[
            y1:y2,
            price_x1:price_x2
        ]

        price, support = (
            ocr_price_crop(
                price_crop
            )
        )

        # ----------------------------------------------------
        # TRY SECOND PRICE PROFILE
        # ----------------------------------------------------

        if price is None:

            secondary = (
                price_profiles[1]
            )

            sx1 = int(
                width
                * secondary[0]
            )

            sx2 = int(
                width
                * secondary[1]
            )

            price_crop = image[
                y1:y2,
                sx1:sx2
            ]

            price, support = (
                ocr_price_crop(
                    price_crop
                )
            )

        if price is None:
            continue

        records.append({
            "week_start":
                week_start,

            "week_end":
                week_end,

            "commodity":
                commodity,

            "raw_item":
                commodity_raw,

            "specification":
                "",

            "unit":
                "kg",

            "raw_unit":
                "",

            "weekly_average_price":
                price,

            "price_support_families":
                support,

            "extraction_method":
                "ocr_table",

            "source_file":
                source_file,
        })

    return (
        records,
        detected
    )


# ============================================================
# OCR COMMODITY COLUMN WITH COORDINATES
# ============================================================

def ocr_commodity_column(
    image,
    original_y,
    scale=2
):

    processed = preprocess_image(
        image,
        scale=scale
    )

    data = (
        pytesseract
        .image_to_data(
            processed,
            config="--psm 6",
            output_type=(
                pytesseract.Output.DICT
            )
        )
    )

    rows = {}

    count = len(
        data["text"]
    )

    for i in range(count):

        text = clean_text(
            data["text"][i]
        )

        if not text:
            continue

        try:

            confidence = float(
                data["conf"][i]
            )

        except Exception:

            confidence = -1

        if confidence < 10:
            continue

        key = (
            int(
                data[
                    "block_num"
                ][i]
            ),
            int(
                data[
                    "par_num"
                ][i]
            ),
            int(
                data[
                    "line_num"
                ][i]
            )
        )

        top = (
            float(
                data["top"][i]
            )
            / scale
        )

        word_height = (
            float(
                data["height"][i]
            )
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

        rows[
            key
        ]["words"].append(
            text
        )

        rows[
            key
        ]["tops"].append(
            page_top
        )

        rows[
            key
        ]["bottoms"].append(
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

        results.append({
            "text":
                text,

            "top":
                top,

            "bottom":
                bottom,

            "center_y":
                (
                    top
                    + bottom
                )
                / 2,
        })

    results.sort(
        key=lambda item:
            item["center_y"]
    )

    return results


# ============================================================
# ROW-ALIGNED OCR
#
# This is the method that successfully extracted:
#
# Target rows found    : 19
# Prices extracted     : 19
# Prices not extracted : 0
#
# on the difficult lines=0 December 16-21 PDF.
# ============================================================

def row_aligned_ocr_page(
    image,
    week_start,
    week_end,
    source_file
):

    records = []

    detected = set()

    height, width, _ = (
        image.shape
    )

    commodity_x1 = int(
        width * 0.005
    )

    commodity_x2 = int(
        width * 0.350
    )

    page_y1 = int(
        height * 0.05
    )

    page_y2 = int(
        height * 0.95
    )

    commodity_crop = image[
        page_y1:page_y2,
        commodity_x1:commodity_x2
    ]

    commodity_rows = (
        ocr_commodity_column(
            commodity_crop,
            original_y=page_y1,
            scale=2
        )
    )

    targets = []

    seen = set()

    for row in commodity_rows:

        # Avoid footer OCR noise.
        if (
            row["center_y"]
            > height * 0.92
        ):
            continue

        commodity, score = (
            match_target(
                row["text"]
            )
        )

        if commodity is None:
            continue

        if commodity in seen:
            continue

        seen.add(
            commodity
        )

        detected.add(
            commodity
        )

        targets.append({
            "commodity":
                commodity,

            "score":
                score,

            "raw":
                row["text"],

            "row":
                row,
        })

    price_profiles = (
        get_price_profiles(
            width,
            height
        )
    )

    for target in targets:

        row = target[
            "row"
        ]

        row_top = int(
            row["top"]
        )

        row_bottom = int(
            row["bottom"]
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

        price = None
        support = 0

        # ----------------------------------------------------
        # TRY PRICE COLUMN PROFILES
        # ----------------------------------------------------

        for profile in (
            price_profiles
        ):

            x1 = int(
                width
                * profile[0]
            )

            x2 = int(
                width
                * profile[1]
            )

            price_crop = image[
                y1:y2,
                x1:x2
            ]

            price, support = (
                ocr_price_crop(
                    price_crop
                )
            )

            if price is not None:
                break

        if price is None:
            continue

        records.append({
            "week_start":
                week_start,

            "week_end":
                week_end,

            "commodity":
                target[
                    "commodity"
                ],

            "raw_item":
                target["raw"],

            "specification":
                "",

            "unit":
                "kg",

            "raw_unit":
                "",

            "weekly_average_price":
                price,

            "price_support_families":
                support,

            "extraction_method":
                "ocr_row_aligned",

            "source_file":
                source_file,
        })

    return (
        records,
        detected
    )


# ============================================================
# SCORE OCR RESULT
# ============================================================

def extraction_quality(
    records,
    detected
):

    valid_count = len(
        records
    )

    detected_count = len(
        detected
    )

    return (
        valid_count,
        detected_count
    )


# ============================================================
# SCANNED PDF EXTRACTION
# ============================================================

def parse_scanned_pdf(
    pdf_path,
    week_start,
    week_end,
    source_file
):

    try:

        pages = convert_from_path(
            pdf_path,
            dpi=300,
            poppler_path=POPPLER_PATH
        )

    except Exception as error:

        print(
            f"  PDF → image error: "
            f"{error}"
        )

        return (
            [],
            set(),
            "ocr_failed"
        )

    all_records = []

    all_detected = set()

    methods_used = []

    for page in pages:

        image = cv2.cvtColor(
            np.array(page),
            cv2.COLOR_RGB2BGR
        )

        height, width, _ = (
            image.shape
        )

        aspect_ratio = (
            width / height
        )

        # ====================================================
        # CHOOSE PRIMARY METHOD
        #
        # Narrow/cropped scan:
        # use ruled-table OCR first.
        #
        # Standard wide scan:
        # use row-aligned OCR first.
        # ====================================================

        if aspect_ratio < 0.62:

            primary_records, primary_detected = (
                table_ocr_page(
                    image,
                    week_start,
                    week_end,
                    source_file
                )
            )

            primary_method = (
                "ocr_table"
            )

            secondary_function = (
                row_aligned_ocr_page
            )

            secondary_method = (
                "ocr_row_aligned"
            )

        else:

            primary_records, primary_detected = (
                row_aligned_ocr_page(
                    image,
                    week_start,
                    week_end,
                    source_file
                )
            )

            primary_method = (
                "ocr_row_aligned"
            )

            secondary_function = (
                table_ocr_page
            )

            secondary_method = (
                "ocr_table"
            )

        primary_quality = (
            extraction_quality(
                primary_records,
                primary_detected
            )
        )

        # ====================================================
        # DECIDE WHETHER FALLBACK IS NEEDED
        # ====================================================

        valid_count = len(
            primary_records
        )

        detected_count = len(
            primary_detected
        )

        needs_fallback = (
            detected_count < 15
            or (
                detected_count > 0
                and (
                    valid_count
                    / detected_count
                ) < 0.70
            )
        )

        selected_records = (
            primary_records
        )

        selected_detected = (
            primary_detected
        )

        selected_method = (
            primary_method
        )

        if needs_fallback:

            (
                secondary_records,
                secondary_detected
            ) = secondary_function(
                image,
                week_start,
                week_end,
                source_file
            )

            secondary_quality = (
                extraction_quality(
                    secondary_records,
                    secondary_detected
                )
            )

            if (
                secondary_quality
                > primary_quality
            ):

                selected_records = (
                    secondary_records
                )

                selected_detected = (
                    secondary_detected
                )

                selected_method = (
                    secondary_method
                )

        all_records.extend(
            selected_records
        )

        all_detected.update(
            selected_detected
        )

        methods_used.append(
            selected_method
        )

    method_string = "+".join(
        sorted(
            set(
                methods_used
            )
        )
    )

    return (
        all_records,
        all_detected,
        method_string
    )


# ============================================================
# REMOVE DUPLICATES
#
# One commodity should have only one observation per
# source weekly PDF.
# ============================================================

def remove_duplicates(
    records
):

    chosen = {}

    method_priority = {
        "pdfplumber": 3,
        "ocr_row_aligned": 2,
        "ocr_table": 1,
    }

    for row in records:

        key = (
            row[
                "week_start"
            ],
            row[
                "commodity"
            ],
            row[
                "source_file"
            ]
        )

        if key not in chosen:

            chosen[key] = row

            continue

        old = chosen[key]

        old_support = (
            old.get(
                "price_support_families"
            )
            or 0
        )

        new_support = (
            row.get(
                "price_support_families"
            )
            or 0
        )

        old_priority = (
            method_priority.get(
                old[
                    "extraction_method"
                ],
                0
            )
        )

        new_priority = (
            method_priority.get(
                row[
                    "extraction_method"
                ],
                0
            )
        )

        if (
            new_priority,
            new_support
        ) > (
            old_priority,
            old_support
        ):

            chosen[key] = row

    return list(
        chosen.values()
    )


# ============================================================
# SAVE DATASET CSV
# ============================================================

def save_dataset(
    records
):

    fields = [
        "week_start",
        "week_end",
        "commodity",
        "raw_item",
        "specification",
        "unit",
        "raw_unit",
        "weekly_average_price",
        "price_support_families",
        "extraction_method",
        "source_file",
    ]

    with open(
        OUTPUT_CSV,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=fields
        )

        writer.writeheader()

        for row in records:

            writer.writerow({
                field:
                    row.get(
                        field,
                        ""
                    )
                for field in fields
            })


# ============================================================
# SAVE EXTRACTION LOG
# ============================================================

def save_log(
    log_rows
):

    fields = [
        "source_file",
        "week_start",
        "week_end",
        "status",
        "selected_method",
        "records_created",
        "targets_detected",
        "text_length",
        "ambiguous_text_lines",
    ]

    with open(
        LOG_CSV,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=fields
        )

        writer.writeheader()

        for row in log_rows:

            writer.writerow(
                row
            )


# ============================================================
# MAIN
# ============================================================

def main():

    print()

    print(
        "=" * 78
    )

    print(
        "DA WEEKLY PRICE HYBRID EXTRACTOR V2"
    )

    print(
        "=" * 78
    )

    print(
        f"\nPDF folder:\n"
        f"{PDF_ROOT}"
    )

    print(
        f"\nDataset output:\n"
        f"{OUTPUT_CSV}"
    )

    print(
        f"\nExtraction log:\n"
        f"{LOG_CSV}"
    )

    pdf_files = find_pdf_files(
        PDF_ROOT
    )

    print(
        f"\nPDF files found: "
        f"{len(pdf_files)}"
    )

    all_records = []

    log_rows = []

    method_counter = Counter()

    failed_files = []

    # ========================================================
    # PROCESS EACH PDF
    # ========================================================

    for index, pdf_path in enumerate(
        pdf_files,
        start=1
    ):

        source_file = os.path.relpath(
            pdf_path,
            PDF_ROOT
        )

        print()

        print(
            f"[{index}/{len(pdf_files)}] "
            f"{source_file}"
        )

        week_start, week_end = (
            extract_week_from_filename(
                pdf_path
            )
        )

        if (
            week_start is None
            or week_end is None
        ):

            print(
                "  FAILED: "
                "could not parse date."
            )

            failed_files.append(
                source_file
            )

            log_rows.append({
                "source_file":
                    source_file,

                "week_start":
                    "",

                "week_end":
                    "",

                "status":
                    "date_failed",

                "selected_method":
                    "",

                "records_created":
                    0,

                "targets_detected":
                    0,

                "text_length":
                    0,

                "ambiguous_text_lines":
                    0,
            })

            continue

        # ====================================================
        # TRY PDFPLUMBER
        # ====================================================

        text = extract_pdf_text(
            pdf_path
        )

        text_length = len(
            text.strip()
        )

        text_records = []

        text_detected = set()

        ambiguous_lines = 0

        if text_length >= 100:

            (
                text_records,
                text_detected,
                ambiguous_lines
            ) = parse_text_pdf(
                text,
                week_start,
                week_end,
                source_file
            )

        # ====================================================
        # TEXT RESULT IS CLEAN ENOUGH
        # ====================================================

        if (
            text_length >= 100
            and len(
                text_records
            ) >= 10
            and ambiguous_lines == 0
        ):

            selected_records = (
                text_records
            )

            selected_detected = (
                text_detected
            )

            selected_method = (
                "pdfplumber"
            )

            print(
                "  Method: pdfplumber"
            )

            print(
                f"  Targets detected: "
                f"{len(selected_detected)}"
            )

            print(
                f"  Records created : "
                f"{len(selected_records)}"
            )

        # ====================================================
        # SCANNED OR AMBIGUOUS TEXT
        # ====================================================

        else:

            if text_length < 100:

                print(
                    "  Text extraction "
                    "insufficient."
                )

            elif ambiguous_lines > 0:

                print(
                    f"  Text extraction has "
                    f"{ambiguous_lines} "
                    f"ambiguous target line(s)."
                )

            else:

                print(
                    "  Text extraction found "
                    "too few target records."
                )

            print(
                "  Running OCR..."
            )

            (
                scan_records,
                scan_detected,
                scan_method
            ) = parse_scanned_pdf(
                pdf_path,
                week_start,
                week_end,
                source_file
            )

            # ------------------------------------------------
            # COMPARE OCR WITH ANY SAFE TEXT RECORDS
            # ------------------------------------------------

            if (
                len(scan_records)
                >= len(text_records)
            ):

                selected_records = (
                    scan_records
                )

                selected_detected = (
                    scan_detected
                )

                selected_method = (
                    scan_method
                )

            else:

                selected_records = (
                    text_records
                )

                selected_detected = (
                    text_detected
                )

                selected_method = (
                    "pdfplumber_partial"
                )

            print(
                f"  Method: "
                f"{selected_method}"
            )

            print(
                f"  Targets detected: "
                f"{len(selected_detected)}"
            )

            print(
                f"  Records created : "
                f"{len(selected_records)}"
            )

        # ====================================================
        # STORE RESULT
        # ====================================================

        if selected_records:

            all_records.extend(
                selected_records
            )

            method_counter[
                selected_method
            ] += 1

            status = "success"

        else:

            status = "no_records"

            failed_files.append(
                source_file
            )

            print(
                "  WARNING: "
                "No usable target records."
            )

        log_rows.append({
            "source_file":
                source_file,

            "week_start":
                week_start,

            "week_end":
                week_end,

            "status":
                status,

            "selected_method":
                selected_method,

            "records_created":
                len(
                    selected_records
                ),

            "targets_detected":
                len(
                    selected_detected
                ),

            "text_length":
                text_length,

            "ambiguous_text_lines":
                ambiguous_lines,
        })

    # ========================================================
    # DEDUPLICATE
    # ========================================================

    before_dedup = len(
        all_records
    )

    all_records = (
        remove_duplicates(
            all_records
        )
    )

    duplicates_removed = (
        before_dedup
        - len(all_records)
    )

    # ========================================================
    # SORT
    # ========================================================

    all_records.sort(
        key=lambda row: (
            row[
                "week_start"
            ],
            row[
                "commodity"
            ]
        )
    )

    # ========================================================
    # SAVE FILES
    # ========================================================

    save_dataset(
        all_records
    )

    save_log(
        log_rows
    )

    # ========================================================
    # SUMMARY
    # ========================================================

    print()

    print(
        "=" * 78
    )

    print(
        "EXTRACTION COMPLETE"
    )

    print(
        "=" * 78
    )

    print(
        f"PDFs processed         : "
        f"{len(pdf_files)}"
    )

    print(
        f"PDFs with records      : "
        f"{len(pdf_files) - len(failed_files)}"
    )

    print(
        f"PDFs with no records   : "
        f"{len(failed_files)}"
    )

    print(
        f"Duplicates removed     : "
        f"{duplicates_removed}"
    )

    print(
        f"Final records          : "
        f"{len(all_records)}"
    )

    print(
        f"Output file            : "
        f"{OUTPUT_CSV}"
    )

    print(
        f"Extraction log         : "
        f"{LOG_CSV}"
    )

    # ========================================================
    # METHODS
    # ========================================================

    print()

    print(
        "=" * 78
    )

    print(
        "PDF EXTRACTION METHODS"
    )

    print(
        "=" * 78
    )

    for method, count in (
        method_counter.items()
    ):

        print(
            f"{method:<30}: "
            f"{count:>4}"
        )

    # ========================================================
    # TARGET COUNTS
    # ========================================================

    counts = Counter(
        row["commodity"]
        for row in all_records
    )

    print()

    print(
        "=" * 78
    )

    print(
        "TARGET COMMODITY COUNTS"
    )

    print(
        "=" * 78
    )

    for commodity in (
        TARGET_COMMODITIES
    ):

        print(
            f"{commodity:<28}: "
            f"{counts.get(commodity, 0):>4}"
        )

    # ========================================================
    # FAILED PDF LIST
    # ========================================================

    if failed_files:

        print()

        print(
            "=" * 78
        )

        print(
            "PDFs STILL NEEDING REVIEW"
        )

        print(
            "=" * 78
        )

        for path in failed_files:

            print(
                path
            )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()