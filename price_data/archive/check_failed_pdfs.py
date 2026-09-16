import os
import re
import pdfplumber
import cv2
import numpy as np
from pdf2image import convert_from_path


# ============================================================
# CONFIG
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PDF_ROOT = os.path.join(
    BASE_DIR,
    "pdfs"
)

POPPLER_PATH = r"C:\poppler-26.02.0\Library\bin"


# ============================================================
# TARGET WORDS
# ============================================================

TARGET_WORDS = [
    "tomato",
    "ampalaya",
    "sitao",
    "pechay",
    "squash",
    "eggplant",
    "cabbage",
    "carrot",
    "potato",
    "onion",
    "garlic",
    "ginger",
]


# ============================================================
# FIND PDF FILES
# ============================================================

def find_pdf_files(root):

    pdf_files = []

    for folder, _, files in os.walk(root):

        for filename in files:

            if filename.lower().endswith(".pdf"):

                pdf_files.append(
                    os.path.join(
                        folder,
                        filename
                    )
                )

    return sorted(pdf_files)


# ============================================================
# CHECK PDFPLUMBER
# ============================================================

def get_pdf_text(pdf_path):

    texts = []

    try:

        with pdfplumber.open(pdf_path) as pdf:

            for page in pdf.pages:

                text = page.extract_text()

                if text:
                    texts.append(text)

    except Exception as e:

        return "", str(e)

    return "\n".join(texts), None


# ============================================================
# CHECK WHETHER TEXT CONTAINS TARGETS
# ============================================================

def contains_target(text):

    text = text.lower()

    for target in TARGET_WORDS:

        if target in text:
            return True

    return False


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
# CHECK OCR LAYOUT
# ============================================================

def inspect_layout(pdf_path):

    try:

        pages = convert_from_path(
            pdf_path,
            dpi=150,
            first_page=1,
            last_page=1,
            poppler_path=POPPLER_PATH
        )

        if not pages:
            return None

        image = cv2.cvtColor(
            np.array(pages[0]),
            cv2.COLOR_RGB2BGR
        )

        height, width, _ = image.shape

        lines = find_horizontal_lines(
            image
        )

        return {
            "width": width,
            "height": height,
            "horizontal_lines": len(lines),
        }

    except Exception as e:

        return {
            "error": str(e)
        }


# ============================================================
# MAIN
# ============================================================

pdf_files = find_pdf_files(
    PDF_ROOT
)

print()
print("=" * 90)
print("PDF EXTRACTION DIAGNOSTIC")
print("=" * 90)

print(
    f"\nPDF files found: {len(pdf_files)}"
)

text_good = []
text_no_target = []
scanned = []


for index, pdf_path in enumerate(
    pdf_files,
    start=1
):

    relative_path = os.path.relpath(
        pdf_path,
        PDF_ROOT
    )

    text, error = get_pdf_text(
        pdf_path
    )

    if error:

        print(
            f"[{index}/{len(pdf_files)}] "
            f"ERROR: {relative_path}"
        )

        continue

    # --------------------------------------------------------
    # HAS TEXT
    # --------------------------------------------------------

    if len(text.strip()) >= 100:

        if contains_target(text):

            text_good.append(
                relative_path
            )

        else:

            text_no_target.append(
                relative_path
            )

    # --------------------------------------------------------
    # SCANNED / NO TEXT
    # --------------------------------------------------------

    else:

        scanned.append(
            relative_path
        )


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 90)
print("SUMMARY")
print("=" * 90)

print(
    f"Text PDFs containing target words : "
    f"{len(text_good)}"
)

print(
    f"Text PDFs without target words    : "
    f"{len(text_no_target)}"
)

print(
    f"Scanned / image PDFs              : "
    f"{len(scanned)}"
)


# ============================================================
# INSPECT SCANNED PDF LAYOUTS
# ============================================================

print()
print("=" * 90)
print("SCANNED PDF LAYOUTS")
print("=" * 90)


for index, relative_path in enumerate(
    scanned,
    start=1
):

    full_path = os.path.join(
        PDF_ROOT,
        relative_path
    )

    result = inspect_layout(
        full_path
    )

    if result is None:

        print(
            f"{relative_path}"
            f" | Unable to inspect"
        )

        continue

    if "error" in result:

        print(
            f"{relative_path}"
            f" | ERROR: {result['error']}"
        )

        continue

    print(
        f"{relative_path:<70}"
        f" | {result['width']}x{result['height']}"
        f" | lines={result['horizontal_lines']}"
    )


# ============================================================
# TEXT PDF PROBLEMS
# ============================================================

if text_no_target:

    print()
    print("=" * 90)
    print("TEXT PDFs WITH NO TARGET WORDS")
    print("=" * 90)

    for path in text_no_target:

        print(path)