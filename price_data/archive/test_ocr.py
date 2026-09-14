from pdf2image import convert_from_path
import pytesseract
import sys
import os

# Explicit paths for Windows
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

POPPLER_PATH = r"C:\poppler-26.02.0\Library\bin"

pdf_path = sys.argv[1]

print(f"Testing OCR: {pdf_path}")

print("\nConverting PDF page to image...")
pages = convert_from_path(
    pdf_path,
    dpi=300,
    poppler_path=POPPLER_PATH
)

for i, page in enumerate(pages):
    print(f"\n===== OCR PAGE {i + 1} =====\n")

    text = pytesseract.image_to_string(page)

    print(text)