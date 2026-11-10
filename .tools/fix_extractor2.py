import io

p = r"B:\B\tax-app\apps\api\src\modules\documents\receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# 1. De-accented view of the text.
old_lower = "    const textLower = (rawText + ' ' + fileName).toLowerCase();"
new_lower = """    const textLower = (rawText + ' ' + fileName).toLowerCase();
    // Taxpayers, employers and the ACD all produce documents with and without
    // accents ("CERTIFICAT DE REMUNERATION" vs "Certificat de Rémunération").
    // Keyword matching runs on the de-accented text so neither spelling is
    // missed — the sample this app ships is the unaccented one.
    const textPlain = stripAccents(textLower);"""
assert s.count(old_lower) == 1
s = s.replace(old_lower, new_lower)

# 2. Rewrite the salary-certificate condition block.
start = s.index("    // --- C. SALARY CERTIFICATE")
end = s.index("    ) {", s.index("code 102", start)) + len("    ) {")
new_block = """    // --- C. SALARY CERTIFICATE (Certificat de Rémunération) ---
    if (
      textPlain.includes('certificat de remuneration') ||
      textPlain.includes('certificat de salaire') ||
      textPlain.includes('salary certificate') ||
      textPlain.includes('salary') ||
      textPlain.includes('remuneration') ||
      textPlain.includes('code 101') ||
      textPlain.includes('code 102')
    ) {"""
s = s[:start] + new_block + s[end:]

# 3. Drop the over-broad 'certif' trigger.
old_line = "      textLower.includes('certif') ||"
assert s.count(old_line) == 1, s.count(old_line)
new_line = (
    "      // NOT 'certif': it is a substring of \"certificat\", so every\n"
    "      // certificate — a salary certificate included — was read as a\n"
    "      // training invoice and produced a bogus trainingCourseExpense.\n"
    "      textPlain.includes('certificat de formation') ||"
)
s = s.replace(old_line, new_line)

# 4. The helper.
anchor = "export class ReceiptAiVisionService {"
helper = """/**
 * Lower-case text with diacritics stripped (é → e, ü → u …).
 *
 * Document text arrives from OCR, from PDFs and from hand-typed samples, and the
 * same certificate spells "rémunération" both ways. Matching on the de-accented
 * form makes the keyword lists independent of that.
 */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
}

export class ReceiptAiVisionService {"""
assert s.count(anchor) == 1
s = s.replace(anchor, helper)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
