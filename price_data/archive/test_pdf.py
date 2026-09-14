import pdfplumber
import sys
import os

if len(sys.argv) < 2:
    print("Usage:")
    print('python price_data\\test_pdf.py "path_to_pdf"')
    sys.exit(1)

pdf_path = sys.argv[1]

if not os.path.exists(pdf_path):
    print(f"File not found: {pdf_path}")
    sys.exit(1)

print(f"Testing PDF: {pdf_path}")

with pdfplumber.open(pdf_path) as pdf:

    for page_number, page in enumerate(pdf.pages, start=1):

        print(f"\n===== PAGE {page_number} =====\n")

        text = page.extract_text()

        if text:
            print(text)
        else:
            print("[NO TEXT EXTRACTED]")