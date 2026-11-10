import io

p = r"B:\B\tax-app\apps\api\src\modules\documents\receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = "      const linePattern = new RegExp(`^\\\\s*${code}\\\\s*[.):-]?[^\\\\n]*$`, 'im');"
new = (
    "      // Both layouts occur: \"101. Rémunération brute …\" and\n"
    "      // \"Code 101 - Rémunération brute …\". The code may be prefixed by the\n"
    "      // word \"Code\" and is followed by a separator or the label itself.\n"
    "      const linePattern = new RegExp(`^\\\\s*(?:code\\\\s*)?${code}\\\\b[^\\\\n]*$`, 'im');"
)

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
