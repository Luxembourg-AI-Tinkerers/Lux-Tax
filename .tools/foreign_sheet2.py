import io

p = r"B:\B\tax-app\apps\api\src\modules\filing\form100-case-map.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# Remove the function entry from the data map: FORM100_INSTRUCTIONS stays pure data.
old = """  /**
   * The exempt-income pointer for a known foreign nature: same credit page, but
   * the sheet named is the one the income actually belongs on.
   */
  foreignCreditOnSheet: (sheet: string, page: number) =>
    ({
      page,
      sheet,
      caseNumber: 'exempt income column',
      kind: 'INSTRUCTION',
    }) as const,
"""
assert s.count(old) == 1
s = s.replace(old, "")

# Export a standalone builder next to the nature map.
anchor = "export const FORM100_INSTRUCTIONS = {"
builder = """/**
 * The exempt-income pointer for a known foreign nature: the sheet where the
 * income belongs, while the credit itself stays on RD 1081/1082.
 *
 * Kept outside `FORM100_INSTRUCTIONS` so that map stays pure data — an existing
 * test asserts every entry there carries `kind: 'INSTRUCTION'`, and a function
 * member would break that invariant for no benefit.
 */
export function foreignSheetPointer(
  nature: { sheet: string; page: number },
): { page: number; sheet: string; caseNumber: string; kind: 'INSTRUCTION' } {
  return {
    page: nature.page,
    sheet: nature.sheet,
    caseNumber: 'exempt income column',
    kind: 'INSTRUCTION',
  };
}

export const FORM100_INSTRUCTIONS = {"""
assert s.count(anchor) == 1
s = s.replace(anchor, builder)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
