import io

p = r"B:\B\tax-app\apps\api\src\modules\documents\receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# 1. An accent-free view of the text, so a keyword match does not depend on
#    whether the certificate was typed with é or E.
old_lower = "    const textLower = (rawText + ' ' + fileName).toLowerCase();"
new_lower = """    const textLower = (rawText + ' ' + fileName).toLowerCase();
    // Taxpayers and the ACD both produce documents with and without accents
    // ("CERTIFICAT DE REMUNERATION" vs "Certificat de Rémunération"). Keyword
    // matching runs on the de-accented text so neither spelling is missed.
    const textPlain = stripAccents(textLower);"""
assert s.count(old_lower) == 1
s = s.replace(old_lower, new_lower)

# 2. Salary certificate: match on the de-accented text.
old_salary = """    if (
      textLower.includes('certificat de rÃ©munÃ©ration') ||
      textLower.includes('certificat de salaire') ||
      textLower.includes('salary') ||
      textLower.includes('rÃ©munÃ©ration') ||
      textLower.includes('code 101') ||
      textLower.includes('code 102')
    ) {"""
new_salary = """    if (
      textPlain.includes('certificat de remuneration') ||
      textPlain.includes('certificat de salaire') ||
      textPlain.includes('certificat de remuneration') ||
      textPlain.includes('salary certificate') ||
      textPlain.includes('salary') ||
      textPlain.includes('remuneration') ||
      textPlain.includes('code 101') ||
      textPlain.includes('code 102')
    ) {"""
assert s.count(old_salary) == 1, s.count(old_salary)
s = s.replace(old_salary, new_salary)

# 3. Drop the over-broad 'certif' trigger: it is a substring of "certificat",
#    so EVERY certificate fell into the training branch.
old_training = """      textLower.includes('sÃ©minaire') ||
      textLower.includes('seminar') ||
      textLower.includes('certif') ||"""
new_training = """      textLower.includes('sÃ©minaire') ||
      textLower.includes('seminar') ||
      // NOT 'certif': it is a substring of "certificat", so every certificate
      // (including a salary certificate) used to be read as a training invoice.
      textPlain.includes('certificat de formation') ||"""
assert s.count(old_training) == 1, s.count(old_training)
s = s.replace(old_training, new_training)

# 4. The helper itself.
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
