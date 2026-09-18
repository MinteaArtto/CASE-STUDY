import os
import re
import sys
import json
import csv
from datetime import datetime

import cv2
import numpy as np
import pdfplumber
import pytesseract
from pdf2image import convert_from_path


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

CATALOG_CSV = os.path.join(
    BASE_DIR,
    "current_catalog_forecast_eligibility.csv"
)


# ============================================================
# TESSERACT / POPPLER
# ============================================================

DEFAULT_TESSERACT_PATH = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

DEFAULT_POPPLER_PATH = (
    r"C:\poppler-26.02.0\Library\bin"
)

TESSERACT_PATH = os.getenv(
    "TESSERACT_PATH",
    DEFAULT_TESSERACT_PATH
)

POPPLER_PATH = os.getenv(
    "POPPLER_PATH",
    DEFAULT_POPPLER_PATH
)

if os.path.isfile(
    TESSERACT_PATH
):
    pytesseract.pytesseract.tesseract_cmd = (
        TESSERACT_PATH
    )


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
# CLEAN TEXT
# ============================================================

def clean_text(value):

    if value is None:
        return ""

    value = str(value)

    value = value.replace(
        "\n",
        " "
    )

    value = value.replace(
        "\r",
        " "
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value.strip()


# ============================================================
# NORMALIZE TEXT
#
# Used only for matching.
# The original DA text is still preserved for display.
# ============================================================

def normalize_text(value):

    value = clean_text(
        value
    ).lower()

    # Remove superscript footnote markers
    # Example:
    # P20 Benteng Bigas Meron Naᵃ
    # becomes:
    # p20 benteng bigas meron na

    value = re.sub(
        r"[ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]",
        "",
        value,
    )

    value = value.replace(
        "–",
        "-"
    )

    value = value.replace(
        "—",
        "-"
    )

    value = re.sub(
        r"[^a-z0-9]+",
        " ",
        value
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value.strip()


# ============================================================
# PARSE NUMBER
# ============================================================

def parse_number(value):

    if value is None:
        return None

    text = clean_text(
        value
    )

    if not text:
        return None

    lowered = text.lower()

    missing_values = {
        "-",
        "—",
        "–",
        "n/a",
        "na",
        "none",
    }

    if lowered in missing_values:
        return None

    text = text.replace(
        "₱",
        ""
    )

    text = text.replace(
        ",",
        ""
    )

    matches = re.findall(
        r"\d+(?:\.\d+)?",
        text
    )

    if not matches:
        return None

    try:
        number = float(
            matches[-1]
        )

    except ValueError:
        return None

    if number <= 0:
        return None

    if number > 100000:
        return None

    return round(
        number,
        2
    )


# ============================================================
# EXTRACT WEEK FROM PDF FILENAME
# ============================================================

def extract_week_from_filename(
    filename
):

    name = os.path.splitext(
        os.path.basename(
            filename
        )
    )[0]

    name = re.sub(
        r"^Weekly-Average-Prices?-",
        "",
        name,
        flags=re.IGNORECASE,
    )

    parts = name.split(
        "-"
    )

    # ========================================================
    # SAME MONTH
    #
    # September-7-13-2026
    # ========================================================

    if (
        len(parts) == 4
        and parts[0] in MONTHS
    ):

        try:

            month = MONTHS[
                parts[0]
            ]

            start = datetime(
                int(parts[3]),
                month,
                int(parts[1]),
            )

            end = datetime(
                int(parts[3]),
                month,
                int(parts[2]),
            )

            return (
                start.strftime(
                    "%Y-%m-%d"
                ),
                end.strftime(
                    "%Y-%m-%d"
                ),
            )

        except ValueError:
            return None, None

    # ========================================================
    # CROSS MONTH
    #
    # April-29-May-4-2024
    # ========================================================

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
                int(parts[1]),
            )

            end = datetime(
                int(parts[4]),
                MONTHS[
                    parts[2]
                ],
                int(parts[3]),
            )

            return (
                start.strftime(
                    "%Y-%m-%d"
                ),
                end.strftime(
                    "%Y-%m-%d"
                ),
            )

        except ValueError:
            return None, None

    # ========================================================
    # CROSS YEAR
    #
    # December-29-2025-January-3-2026
    # ========================================================

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
                int(parts[1]),
            )

            end = datetime(
                int(parts[5]),
                MONTHS[
                    parts[3]
                ],
                int(parts[4]),
            )

            return (
                start.strftime(
                    "%Y-%m-%d"
                ),
                end.strftime(
                    "%Y-%m-%d"
                ),
            )

        except ValueError:
            return None, None

    return None, None


# ============================================================
# LOAD CURRENT CATALOG
# ============================================================

def load_catalog():

    if not os.path.isfile(
        CATALOG_CSV
    ):
        return []

    rows = []

    with open(
        CATALOG_CSV,
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:

        reader = csv.DictReader(
            file
        )

        for row in reader:

            category = clean_text(
                row.get(
                    "category"
                )
            )

            commodity = clean_text(
                row.get(
                    "commodity"
                )
            )

            specification = clean_text(
                row.get(
                    "specification"
                )
            )

            unit = clean_text(
                row.get(
                    "unit"
                )
            )

            series_key = clean_text(
                row.get(
                    "series_key"
                )
            )

            rows.append({
                "seriesKey":
                    series_key,

                "category":
                    category,

                "commodity":
                    commodity,

                "specification":
                    specification,

                "unit":
                    unit,

                "normalizedCommodity":
                    normalize_text(
                        commodity
                    ),

                "normalizedSpecification":
                    normalize_text(
                        specification
                    ),

                "normalizedCategory":
                    normalize_text(
                        category
                    ),

                "normalizedUnit":
                    normalize_text(
                        unit
                    ),
            })

    return rows


# ============================================================
# BUILD SERIES KEY
# ============================================================

def build_series_key(
    category,
    commodity,
    specification,
    unit,
):

    category = clean_text(
        category
    )

    commodity = clean_text(
        commodity
    )

    specification = clean_text(
        specification
    )

    unit = clean_text(
        unit
    )

    specification_for_key = (
        specification
        if specification
        else "(no specification)"
    )

    return (
        f"{category} | "
        f"{commodity} | "
        f"{specification_for_key} | "
        f"{unit}"
    )


# ============================================================
# MATCH EXTRACTED ROW TO CURRENT CATALOG
#
# This does NOT filter rows.
# It only checks whether the extracted series already exists.
# ============================================================

def match_catalog_record(
    record,
    catalog,
):

    commodity = normalize_text(
        record.get(
            "commodity"
        )
    )

    specification = normalize_text(
        record.get(
            "specification"
        )
    )

    category = normalize_text(
        record.get(
            "category"
        )
    )

    unit = normalize_text(
        record.get(
            "unit"
        )
    )

    if not commodity:
        return None

    # ========================================================
    # 1. BEST MATCH
    # commodity + specification + category + unit
    # ========================================================

    for item in catalog:

        if (
            item[
                "normalizedCommodity"
            ] == commodity
            and item[
                "normalizedSpecification"
            ] == specification
            and item[
                "normalizedCategory"
            ] == category
            and (
                not unit
                or item[
                    "normalizedUnit"
                ] == unit
            )
        ):
            return item

    # ========================================================
    # 2. COMMODITY + SPECIFICATION
    # ========================================================

    if specification:

        matches = [
            item
            for item in catalog
            if (
                item[
                    "normalizedCommodity"
                ] == commodity
                and item[
                    "normalizedSpecification"
                ] == specification
            )
        ]

        if len(matches) == 1:
            return matches[0]

    # ========================================================
    # 3. COMMODITY + UNIT
    #
    # Example:
    #
    # Cooking Oil (Coconut)
    # ml
    #
    # uniquely identifies:
    #
    # 350 ml/bottle
    #
    # while L identifies:
    #
    # 1 Liter/bottle
    # ========================================================

    if unit:

        matches = [
            item
            for item in catalog
            if (
                item[
                    "normalizedCommodity"
                ] == commodity
                and item[
                    "normalizedUnit"
                ] == unit
            )
        ]

        if len(matches) == 1:
            return matches[0]

    # ========================================================
    # 4. ONLY ONE SERIES USES THIS COMMODITY
    # ========================================================

    matches = [
        item
        for item in catalog
        if (
            item[
                "normalizedCommodity"
            ] == commodity
        )
    ]

    if len(matches) == 1:
        return matches[0]

    return None


# ============================================================
# HEADER KEYWORDS
# ============================================================

CATEGORY_HEADERS = [
    "category",
    "classification",
    "product group",
    "commodity group",
]

COMMODITY_HEADERS = [
    "commodity",
    "product",
    "item",
    "commodities",
]

SPECIFICATION_HEADERS = [
    "specification",
    "specifications",
    "description",
    "size",
    "variety",
]

UNIT_HEADERS = [
    "unit",
    "unit of measure",
    "uom",
]

PRICE_HEADERS = [
    "weekly average",
    "average price",
    "weekly average price",
    "retail price",
    "average",
    "price",
]


# ============================================================
# HEADER MATCH
# ============================================================

def header_matches(
    value,
    candidates,
):

    normalized = normalize_text(
        value
    )

    if not normalized:
        return False

    for candidate in candidates:

        normalized_candidate = (
            normalize_text(
                candidate
            )
        )

        if (
            normalized_candidate
            in normalized
        ):
            return True

    return False


# ============================================================
# DETECT HEADER MAP
# ============================================================

def detect_header_map(
    row
):

    result = {
        "category": None,
        "commodity": None,
        "specification": None,
        "unit": None,
        "price": None,
    }

    for index, cell in enumerate(
        row
    ):

        text = clean_text(
            cell
        )

        if not text:
            continue

        if header_matches(
            text,
            CATEGORY_HEADERS,
        ):
            result[
                "category"
            ] = index

        if header_matches(
            text,
            COMMODITY_HEADERS,
        ):
            result[
                "commodity"
            ] = index

        if header_matches(
            text,
            SPECIFICATION_HEADERS,
        ):
            result[
                "specification"
            ] = index

        if header_matches(
            text,
            UNIT_HEADERS,
        ):
            result[
                "unit"
            ] = index

        if header_matches(
            text,
            PRICE_HEADERS,
        ):
            result[
                "price"
            ] = index

    return result


# ============================================================
# IS PROBABLE HEADER
# ============================================================

def is_probable_header(
    row
):

    header_map = detect_header_map(
        row
    )

    score = 0

    if (
        header_map[
            "commodity"
        ] is not None
    ):
        score += 1

    if (
        header_map[
            "price"
        ] is not None
    ):
        score += 1

    if (
        header_map[
            "unit"
        ] is not None
    ):
        score += 1

    if (
        header_map[
            "specification"
        ] is not None
    ):
        score += 1

    return score >= 2


# ============================================================
# GET CELL SAFELY
# ============================================================

def get_cell(
    row,
    index,
):

    if index is None:
        return ""

    if (
        index < 0
        or index >= len(row)
    ):
        return ""

    return clean_text(
        row[index]
    )


# ============================================================
# GUESS PRICE INDEX
# ============================================================

def guess_price_index(
    row
):

    candidates = []

    for index, cell in enumerate(
        row
    ):

        number = parse_number(
            cell
        )

        if number is not None:

            candidates.append(
                (
                    index,
                    number,
                )
            )

    if not candidates:
        return None

    return candidates[-1][0]


# ============================================================
# GUESS UNIT
# ============================================================

def guess_unit(
    row
):

    known_units = {
        "kg",
        "pc",
        "pcs",
        "piece",
        "pieces",
        "l",
        "liter",
        "litre",
        "ml",
        "bottle",
        "pack",
    }

    for cell in row:

        cleaned = clean_text(
            cell
        )

        normalized = (
            cleaned.lower()
        )

        if normalized in known_units:

            if normalized in {
                "pcs",
                "piece",
                "pieces",
            }:
                return "pc"

            if normalized in {
                "liter",
                "litre",
            }:
                return "L"

            if normalized == "l":
                return "L"

            return cleaned

    return ""


# ============================================================
# DETECT CATEGORY ROW
# ============================================================

def detect_category_row(
    row
):

    non_empty = [
        clean_text(
            cell
        )
        for cell in row
        if clean_text(
            cell
        )
    ]

    if not non_empty:
        return None

    numeric_values = [
        parse_number(
            cell
        )
        for cell in row
    ]

    numeric_count = len(
        [
            value
            for value in numeric_values
            if value is not None
        ]
    )

    if numeric_count > 0:
        return None

    joined = " ".join(
        non_empty
    )

    letters = [
        character
        for character in joined
        if character.isalpha()
    ]

    if not letters:
        return None

    uppercase_count = sum(
        1
        for character in letters
        if character.isupper()
    )

    uppercase_ratio = (
        uppercase_count
        / len(letters)
    )

    if (
        uppercase_ratio >= 0.70
        and len(joined) <= 120
    ):
        return clean_text(
            joined
        )

    return None


# ============================================================
# DETECT POSSIBLE SPECIFICATION
# ============================================================

def looks_like_specification(
    value
):

    value = clean_text(
        value
    )

    if not value:
        return False

    normalized = normalize_text(
        value
    )

    # ========================================================
    # COMMON DA SPECIFICATION PATTERNS
    # ========================================================

    patterns = [
        r"\b\d+\s*ml\b",
        r"\b\d+\s*liter\b",
        r"\b\d+\s*litre\b",
        r"\b\d+\s*l\b",
        r"\bbottle\b",
        r"\bpcs?\s*kg\b",
        r"\bgrams?\s*pc\b",
        r"\bgm\b",
        r"\bkg\s*head\b",
        r"\bcm\b",
        r"\bmm\b",
        r"\bbroken\b",
        r"\bbran streak\b",
        r"\bmedium\b",
        r"\blarge\b",
        r"\bsmall\b",
        r"\bextra large\b",
        r"\bextra small\b",
        r"\bjumbo\b",
        r"\bpewee\b",
        r"\bripe\b",
        r"\bfresh\b",
        r"\bchilled\b",
        r"\bfully dressed\b",
        r"\bmeat with bones\b",
        r"\blean meat\b",
        r"\bhaba\b",
        r"\bpanigang\b",
        r"\btingala\b",
        r"\bsuprema\b",
        r"\bglutinous\b",
        r"\bsweet corn\b",
        r"\bfood grade\b",
        r"\bfeed grade\b",
        r"\bwhite rice\b",
    ]

    for pattern in patterns:

        if re.search(
            pattern,
            normalized,
            flags=re.IGNORECASE,
        ):
            return True

    return False


# ============================================================
# PARSE ONE TABLE ROW
# ============================================================

def parse_table_row(
    row,
    header_map,
    current_category,
):

    cleaned_row = [
        clean_text(cell)
        for cell in row
    ]

    if not any(
        cleaned_row
    ):
        return None

    # ========================================================
    # CATEGORY
    # ========================================================

    category = get_cell(
        cleaned_row,
        header_map.get(
            "category"
        ),
    )

    if not category:
        category = (
            current_category
            or ""
        )

    # ========================================================
    # COMMODITY
    # ========================================================

    commodity = get_cell(
        cleaned_row,
        header_map.get(
            "commodity"
        ),
    )

    # ========================================================
    # SPECIFICATION
    # ========================================================

    specification = get_cell(
        cleaned_row,
        header_map.get(
            "specification"
        ),
    )

    # ========================================================
    # UNIT
    # ========================================================

    unit = get_cell(
        cleaned_row,
        header_map.get(
            "unit"
        ),
    )

    # ========================================================
    # PRICE
    # ========================================================

    price_index = (
        header_map.get(
            "price"
        )
    )

    if price_index is None:
        price_index = (
            guess_price_index(
                cleaned_row
            )
        )

    price_text = get_cell(
        cleaned_row,
        price_index,
    )

    price = parse_number(
        price_text
    )

    # ========================================================
    # FALLBACK COMMODITY
    # ========================================================

    if not commodity:

        ignored_indexes = {
            header_map.get(
                "category"
            ),
            header_map.get(
                "specification"
            ),
            header_map.get(
                "unit"
            ),
            price_index,
        }

        for index, cell in enumerate(
            cleaned_row
        ):

            if index in ignored_indexes:
                continue

            if not cell:
                continue

            if parse_number(
                cell
            ) is not None:
                continue

            commodity = cell

            break

    # ========================================================
    # FALLBACK UNIT
    # ========================================================

    if not unit:

        unit = guess_unit(
            cleaned_row
        )

    # ========================================================
    # FALLBACK SPECIFICATION
    #
    # Some DA PDFs contain a specification value but
    # pdfplumber does not identify the header correctly.
    #
    # Search all unused text cells.
    # ========================================================

    if not specification:

        ignored_indexes = {
            header_map.get(
                "category"
            ),
            header_map.get(
                "commodity"
            ),
            header_map.get(
                "unit"
            ),
            price_index,
        }

        possible_specs = []

        for index, cell in enumerate(
            cleaned_row
        ):

            if index in ignored_indexes:
                continue

            if not cell:
                continue

            if (
                commodity
                and normalize_text(
                    cell
                )
                == normalize_text(
                    commodity
                )
            ):
                continue

            if re.fullmatch(
                r"[₱\s,.0-9\-–—]+",
                cell,
            ):
                continue

            if normalize_text(
                cell
            ) in {
                "kg",
                "pc",
                "pcs",
                "l",
                "ml",
            }:
                continue

            if looks_like_specification(
                cell
            ):
                possible_specs.append(
                    cell
                )

        if possible_specs:

            specification = (
                possible_specs[0]
            )

    # ========================================================
    # SECOND SPECIFICATION PASS
    #
    # Search the complete row in case the PDF split columns
    # differently than expected.
    # ========================================================

    if not specification:

        for cell in cleaned_row:

            if not cell:
                continue

            if (
                commodity
                and normalize_text(
                    cell
                )
                == normalize_text(
                    commodity
                )
            ):
                continue

            if looks_like_specification(
                cell
            ):

                specification = cell

                break

    # ========================================================
    # MUST HAVE COMMODITY
    # ========================================================

    if not commodity:
        return None

    normalized_commodity = (
        normalize_text(
            commodity
        )
    )

    # ========================================================
    # SKIP TABLE HEADER / FOOTER NOISE
    # ========================================================

    noise_terms = [
        "commodity",
        "weekly average",
        "average retail",
        "prevailing retail",
        "source",
        "department of agriculture",
        "price monitoring",
        "note",
        "legend",
    ]

    for term in noise_terms:

        if (
            normalize_text(
                term
            )
            == normalized_commodity
        ):
            return None

    return {
        "category":
            category,

        "commodity":
            commodity,

        "specification":
            specification,

        "unit":
            unit,

        "weeklyAveragePrice":
            price,

        "rawPrice":
            price_text,

        "rawRow":
            cleaned_row,
    }


# ============================================================
# EXTRACT TEXT-BASED PDF USING PDFPLUMBER
# ============================================================

def extract_with_pdfplumber(
    pdf_path,
):

    records = []

    tables_found = 0

    current_category = ""

    with pdfplumber.open(
        pdf_path
    ) as pdf:

        total_text = []

        for page_number, page in enumerate(
            pdf.pages,
            start=1,
        ):

            text = (
                page.extract_text()
                or ""
            )

            total_text.append(
                text
            )

            tables = []

            try:

                tables = (
                    page.extract_tables()
                    or []
                )

            except Exception:

                tables = []

            for table in tables:

                if not table:
                    continue

                tables_found += 1

                header_map = {
                    "category": None,
                    "commodity": None,
                    "specification": None,
                    "unit": None,
                    "price": None,
                }

                header_found = False

                for row in table:

                    if not row:
                        continue

                    cleaned = [
                        clean_text(
                            cell
                        )
                        for cell in row
                    ]

                    # ==========================================
                    # HEADER
                    # ==========================================

                    if is_probable_header(
                        cleaned
                    ):

                        detected = (
                            detect_header_map(
                                cleaned
                            )
                        )

                        for key in header_map:

                            if (
                                detected[
                                    key
                                ]
                                is not None
                            ):

                                header_map[
                                    key
                                ] = detected[
                                    key
                                ]

                        header_found = True

                        continue

                    # ==========================================
                    # CATEGORY
                    # ==========================================

                    category_candidate = (
                        detect_category_row(
                            cleaned
                        )
                    )

                    if category_candidate:

                        current_category = (
                            category_candidate
                        )

                        continue

                    # ==========================================
                    # DATA ROW
                    # ==========================================

                    parsed = parse_table_row(
                        cleaned,
                        header_map,
                        current_category,
                    )

                    if not parsed:
                        continue

                    parsed[
                        "page"
                    ] = page_number

                    parsed[
                        "extractionMethod"
                    ] = "pdfplumber"

                    parsed[
                        "needsReview"
                    ] = False

                    parsed[
                        "reviewReason"
                    ] = None

                    parsed[
                        "headerDetected"
                    ] = header_found

                    records.append(
                        parsed
                    )

        combined_text = "\n".join(
            total_text
        )

    return {
        "records":
            records,

        "textLength":
            len(
                combined_text.strip()
            ),

        "tablesFound":
            tables_found,
    }


# ============================================================
# GROUP OCR WORDS INTO LINES
# ============================================================

def ocr_page_lines(
    image
):

    rgb = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB,
    )

    data = (
        pytesseract
        .image_to_data(
            rgb,
            config="--psm 6",
            output_type=(
                pytesseract
                .Output
                .DICT
            ),
        )
    )

    groups = {}

    count = len(
        data["text"]
    )

    for index in range(
        count
    ):

        text = clean_text(
            data["text"][
                index
            ]
        )

        if not text:
            continue

        try:

            confidence = float(
                data["conf"][
                    index
                ]
            )

        except Exception:

            confidence = -1

        if confidence < 0:
            continue

        key = (
            data["block_num"][
                index
            ],
            data["par_num"][
                index
            ],
            data["line_num"][
                index
            ],
        )

        if key not in groups:

            groups[key] = {
                "words": [],
                "lefts": [],
                "tops": [],
                "confidences": [],
            }

        groups[
            key
        ]["words"].append(
            text
        )

        groups[
            key
        ]["lefts"].append(
            int(
                data["left"][
                    index
                ]
            )
        )

        groups[
            key
        ]["tops"].append(
            int(
                data["top"][
                    index
                ]
            )
        )

        groups[
            key
        ]["confidences"].append(
            confidence
        )

    lines = []

    for group in groups.values():

        text = clean_text(
            " ".join(
                group[
                    "words"
                ]
            )
        )

        if not text:
            continue

        lines.append({
            "text":
                text,

            "top":
                min(
                    group[
                        "tops"
                    ]
                ),

            "left":
                min(
                    group[
                        "lefts"
                    ]
                ),

            "confidence":
                round(
                    sum(
                        group[
                            "confidences"
                        ]
                    )
                    / max(
                        len(
                            group[
                                "confidences"
                            ]
                        ),
                        1,
                    ),
                    2,
                ),
        })

    lines.sort(
        key=lambda item: (
            item[
                "top"
            ],
            item[
                "left"
            ],
        )
    )

    return lines


# ============================================================
# OCR LINE TO PREVIEW ROW
# ============================================================

def parse_ocr_line(
    text,
    current_category,
):

    cleaned = clean_text(
        text
    )

    if not cleaned:
        return None

    normalized = normalize_text(
        cleaned
    )

    noise_contains = [
        "department of agriculture",
        "weekly average",
        "price monitoring",
        "prevailing retail price",
        "commodity specification",
        "source",
        "page ",
    ]

    for noise in noise_contains:

        if normalize_text(
            noise
        ) in normalized:

            return None

    # ========================================================
    # CATEGORY LINE
    # ========================================================

    letters = [
        char
        for char in cleaned
        if char.isalpha()
    ]

    if letters:

        uppercase_count = sum(
            1
            for char in letters
            if char.isupper()
        )

        uppercase_ratio = (
            uppercase_count
            / len(letters)
        )

        if (
            uppercase_ratio >= 0.80
            and parse_number(
                cleaned
            ) is None
            and len(
                cleaned
            ) <= 100
        ):

            return {
                "categoryOnly":
                    cleaned
            }

    # ========================================================
    # PRICE
    # ========================================================

    price = parse_number(
        cleaned
    )

    if price is None:
        return None

    price_matches = list(
        re.finditer(
            r"\d+(?:[.,]\d+)?",
            cleaned,
        )
    )

    if not price_matches:
        return None

    last_match = (
        price_matches[-1]
    )

    description = clean_text(
        cleaned[
            :last_match.start()
        ]
    )

    if not description:
        return None

    # ========================================================
    # UNIT
    # ========================================================

    unit = ""

    unit_match = re.search(
        r"\b(kg|pc|pcs|l|liter|litre|ml)\b",
        description,
        flags=re.IGNORECASE,
    )

    if unit_match:

        raw_unit = (
            unit_match.group(
                1
            )
        )

        lowered = (
            raw_unit.lower()
        )

        if lowered == "pcs":

            unit = "pc"

        elif lowered in {
            "liter",
            "litre",
            "l",
        }:

            unit = "L"

        elif lowered == "ml":

            unit = "ml"

        else:

            unit = lowered

    # ========================================================
    # OCR ROWS ALWAYS REQUIRE ADMIN REVIEW
    # ========================================================

    return {
        "category":
            current_category
            or "",

        "commodity":
            description,

        "specification":
            "",

        "unit":
            unit,

        "weeklyAveragePrice":
            price,

        "rawPrice":
            str(
                price
            ),

        "rawRow":
            [
                cleaned
            ],

        "extractionMethod":
            "ocr",

        "needsReview":
            True,

        "reviewReason":
            (
                "This row was extracted using OCR. "
                "Please verify the category, commodity, "
                "specification, unit, and price before applying."
            ),
    }


# ============================================================
# EXTRACT SCANNED PDF WITH OCR
# ============================================================

def extract_with_ocr(
    pdf_path
):

    if not os.path.isdir(
        POPPLER_PATH
    ):

        raise RuntimeError(
            "Poppler could not be found. "
            "Set POPPLER_PATH before using OCR."
        )

    pages = convert_from_path(
        pdf_path,
        dpi=300,
        poppler_path=(
            POPPLER_PATH
        ),
    )

    records = []

    current_category = ""

    for page_number, page in enumerate(
        pages,
        start=1,
    ):

        image = cv2.cvtColor(
            np.array(
                page
            ),
            cv2.COLOR_RGB2BGR,
        )

        lines = ocr_page_lines(
            image
        )

        for line in lines:

            parsed = parse_ocr_line(
                line[
                    "text"
                ],
                current_category,
            )

            if not parsed:
                continue

            if (
                "categoryOnly"
                in parsed
            ):

                current_category = (
                    parsed[
                        "categoryOnly"
                    ]
                )

                continue

            parsed[
                "page"
            ] = page_number

            parsed[
                "ocrConfidence"
            ] = line[
                "confidence"
            ]

            records.append(
                parsed
            )

    return records


# ============================================================
# REMOVE EXACT DUPLICATES
# ============================================================

def remove_duplicate_rows(
    records
):

    seen = set()

    output = []

    for record in records:

        key = (
            normalize_text(
                record.get(
                    "category"
                )
            ),
            normalize_text(
                record.get(
                    "commodity"
                )
            ),
            normalize_text(
                record.get(
                    "specification"
                )
            ),
            normalize_text(
                record.get(
                    "unit"
                )
            ),
            record.get(
                "weeklyAveragePrice"
            ),
        )

        if key in seen:
            continue

        seen.add(
            key
        )

        output.append(
            record
        )

    return output


# ============================================================
# ENRICH WITH CATALOG STATUS
# ============================================================

def enrich_records(
    records,
    catalog
):

    enriched = []

    for record in records:

        matched = (
            match_catalog_record(
                record,
                catalog,
            )
        )

        if matched:

            catalog_status = (
                "existing"
            )

            series_key = (
                matched[
                    "seriesKey"
                ]
            )

            # ==================================================
            # IMPORTANT:
            #
            # If pdfplumber failed to extract specification,
            # restore it from the existing catalog match.
            # ==================================================

            if not record.get(
                "category"
            ):

                record[
                    "category"
                ] = matched[
                    "category"
                ]

            if not record.get(
                "specification"
            ):

                record[
                    "specification"
                ] = matched[
                    "specification"
                ]

            if not record.get(
                "unit"
            ):

                record[
                    "unit"
                ] = matched[
                    "unit"
                ]

        else:

            catalog_status = (
                "new"
            )

            series_key = (
                build_series_key(
                    record.get(
                        "category",
                        "",
                    ),
                    record.get(
                        "commodity",
                        "",
                    ),
                    record.get(
                        "specification",
                        "",
                    ),
                    record.get(
                        "unit",
                        "",
                    ),
                )
            )

        enriched.append({
            "category":
                record.get(
                    "category",
                    "",
                ),

            "commodity":
                record.get(
                    "commodity",
                    "",
                ),

            "specification":
                record.get(
                    "specification",
                    "",
                ),

            "unit":
                record.get(
                    "unit",
                    "",
                ),

            "weeklyAveragePrice":
                record.get(
                    "weeklyAveragePrice"
                ),

            "rawPrice":
                record.get(
                    "rawPrice",
                    "",
                ),

            "seriesKey":
                series_key,

            "catalogStatus":
                catalog_status,

            "isNewCommodity":
                (
                    catalog_status
                    == "new"
                ),

            "extractionMethod":
                record.get(
                    "extractionMethod"
                ),

            "needsReview":
                bool(
                    record.get(
                        "needsReview"
                    )
                ),

            "reviewReason":
                record.get(
                    "reviewReason"
                ),

            "page":
                record.get(
                    "page"
                ),

            "ocrConfidence":
                record.get(
                    "ocrConfidence"
                ),

            "rawRow":
                record.get(
                    "rawRow",
                    [],
                ),
        })

    return enriched


# ============================================================
# VALIDATE PDF
# ============================================================

def validate_pdf(
    pdf_path
):

    if not os.path.isfile(
        pdf_path
    ):

        raise FileNotFoundError(
            f"PDF file not found: {pdf_path}"
        )

    with open(
        pdf_path,
        "rb",
    ) as file:

        signature = (
            file.read(
                5
            )
        )

    if signature != b"%PDF-":

        raise ValueError(
            "The supplied file is not a valid PDF."
        )


# ============================================================
# EXTRACT SINGLE LATEST DA PDF
# ============================================================

def extract_single_pdf(
    pdf_path
):

    validate_pdf(
        pdf_path
    )

    filename = os.path.basename(
        pdf_path
    )

    week_start, week_end = (
        extract_week_from_filename(
            filename
        )
    )

    if (
        week_start is None
        or week_end is None
    ):

        raise ValueError(
            "Could not determine the report week "
            "from the DA PDF filename."
        )

    catalog = load_catalog()

    # ========================================================
    # TRY PDFPLUMBER FIRST
    # ========================================================

    text_result = (
        extract_with_pdfplumber(
            pdf_path
        )
    )

    text_records = (
        text_result[
            "records"
        ]
    )

    text_length = (
        text_result[
            "textLength"
        ]
    )

    tables_found = (
        text_result[
            "tablesFound"
        ]
    )

    # ========================================================
    # DETERMINE TEXT VS OCR
    # ========================================================

    use_pdfplumber = (
        text_length >= 100
        and tables_found > 0
        and len(
            text_records
        ) >= 5
    )

    if use_pdfplumber:

        selected_records = (
            text_records
        )

        selected_method = (
            "pdfplumber"
        )

        document_needs_review = (
            False
        )

    else:

        selected_records = (
            extract_with_ocr(
                pdf_path
            )
        )

        selected_method = (
            "ocr"
        )

        document_needs_review = (
            True
        )

    # ========================================================
    # REMOVE DUPLICATES
    # ========================================================

    selected_records = (
        remove_duplicate_rows(
            selected_records
        )
    )

    # ========================================================
    # EXISTING VS NEW
    # ========================================================

    selected_records = (
        enrich_records(
            selected_records,
            catalog,
        )
    )

    # ========================================================
    # SORT
    # ========================================================

    selected_records.sort(
        key=lambda row: (
            normalize_text(
                row.get(
                    "category"
                )
            ),
            normalize_text(
                row.get(
                    "commodity"
                )
            ),
            normalize_text(
                row.get(
                    "specification"
                )
            ),
        )
    )

    # ========================================================
    # FINAL RESPONSE RECORDS
    # ========================================================

    final_records = []

    for record in selected_records:

        final_records.append({
            "weekStart":
                week_start,

            "weekEnd":
                week_end,

            "category":
                record[
                    "category"
                ],

            "commodity":
                record[
                    "commodity"
                ],

            "specification":
                record[
                    "specification"
                ],

            "unit":
                record[
                    "unit"
                ],

            "weeklyAveragePrice":
                record[
                    "weeklyAveragePrice"
                ],

            "seriesKey":
                record[
                    "seriesKey"
                ],

            "catalogStatus":
                record[
                    "catalogStatus"
                ],

            "isNewCommodity":
                record[
                    "isNewCommodity"
                ],

            "extractionMethod":
                record[
                    "extractionMethod"
                ],

            "needsReview":
                record[
                    "needsReview"
                ],

            "reviewReason":
                record[
                    "reviewReason"
                ],

            "page":
                record[
                    "page"
                ],

            "ocrConfidence":
                record[
                    "ocrConfidence"
                ],

            "rawPrice":
                record[
                    "rawPrice"
                ],

            "rawRow":
                record[
                    "rawRow"
                ],

            "sourceFile":
                filename,
        })

    # ========================================================
    # COUNTS
    # ========================================================

    existing_count = sum(
        1
        for record in final_records
        if (
            record[
                "catalogStatus"
            ]
            == "existing"
        )
    )

    new_count = sum(
        1
        for record in final_records
        if record[
            "isNewCommodity"
        ]
    )

    review_count = sum(
        1
        for record in final_records
        if record[
            "needsReview"
        ]
    )

    available_price_count = sum(
        1
        for record in final_records
        if (
            record[
                "weeklyAveragePrice"
            ]
            is not None
        )
    )

    missing_price_count = (
        len(
            final_records
        )
        - available_price_count
    )

    return {
        "success":
            True,

        "report": {
            "filename":
                filename,

            "weekStart":
                week_start,

            "weekEnd":
                week_end,
        },

        "extraction": {
            "method":
                selected_method,

            "recordsCreated":
                len(
                    final_records
                ),

            "textLength":
                text_length,

            "tablesFound":
                tables_found,

            "existingCatalogItems":
                existing_count,

            "newCatalogItems":
                new_count,

            "recordsNeedingReview":
                review_count,

            "availablePrices":
                available_price_count,

            "missingPrices":
                missing_price_count,

            "documentNeedsReview":
                document_needs_review,
        },

        "records":
            final_records,
    }


# ============================================================
# COMMAND LINE
# ============================================================

def main():

    if len(
        sys.argv
    ) < 2:

        print(
            json.dumps(
                {
                    "success":
                        False,

                    "message":
                        "A PDF path must be provided.",
                },
                ensure_ascii=True,
            )
        )

        sys.exit(
            1
        )

    pdf_path = (
        sys.argv[1]
    )

    try:

        result = (
            extract_single_pdf(
                pdf_path
            )
        )

        # ====================================================
        # ensure_ascii=True avoids Windows console encoding
        # problems with characters such as superscripts.
        #
        # Node JSON.parse() restores them correctly.
        # ====================================================

        print(
            json.dumps(
                result,
                ensure_ascii=True,
            )
        )

    except Exception as error:

        print(
            json.dumps(
                {
                    "success":
                        False,

                    "message":
                        str(
                            error
                        ),
                },
                ensure_ascii=True,
            )
        )

        sys.exit(
            1
        )


if __name__ == "__main__":
    main()