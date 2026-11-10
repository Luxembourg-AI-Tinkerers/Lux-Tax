import io

p = r"B:\B\tax-app\apps\api\src\modules\documents\receipt-ai-vision.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# The helper was inserted after @Injectable(), splitting it from its class.
old = """@Injectable()
/**
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

new = """/**
 * Lower-case text with diacritics stripped (é → e, ü → u …).
 *
 * Document text arrives from OCR, from PDFs and from hand-typed samples, and the
 * same certificate spells "rémunération" both ways. Matching on the de-accented
 * form makes the keyword lists independent of that.
 */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
}

@Injectable()
export class ReceiptAiVisionService {"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
