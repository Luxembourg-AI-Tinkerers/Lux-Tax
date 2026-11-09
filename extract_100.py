from pypdf import PdfReader
r = PdfReader(r"B:\B\tax-app\100f-2025.pdf")
print("pages", len(r.pages))
for i, p in enumerate(r.pages):
    t = p.extract_text() or ""
    print("\n===== PAGE", i + 1, "len", len(t), "=====")
    print(t[:2200])
