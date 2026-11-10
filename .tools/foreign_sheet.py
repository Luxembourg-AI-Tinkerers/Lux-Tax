import io

p = r"B:\B\tax-app\apps\api\src\modules\filing\form100-case-map.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

anchor = "export const FORM100_INSTRUCTIONS = {"
assert s.count(anchor) == 1

addition = """/**
 * Which Form 100 sheet carries treaty-exempt foreign income of a given nature.
 *
 * The 100F has no foreign-income sheet: exempt foreign income is declared in the
 * "revenus exonérés" column of the category sheet matching its nature, and the
 * credit is claimed on RD 1081/1082. The nature travels on the fact's field key
 * because the app has no per-fact foreign nature field — but a wrong sheet is
 * worse than no sheet, so an unknown key returns `null` and the caller falls
 * back to the generic "S/P/CM/L" sentence.
 *
 * S = salary / employment income, P = pension, CM = capital (movable),
 * L = rental (immovable).
 */
const FOREIGN_NATURE_SHEETS: Record<
  string,
  { sheet: string; page: number; label: string }
> = {
  foreignSalary: { sheet: 'S', page: 9, label: 'salary / employment income' },
  foreignPension: { sheet: 'P', page: 11, label: 'pension' },
  foreignCapital: { sheet: 'CM', page: 12, label: 'capital (movable) income' },
  foreignRental: { sheet: 'L', page: 13, label: 'rental (immovable) income' },
};

export function foreignNatureSheet(
  fieldKey: string | null | undefined,
): { sheet: string; page: number; label: string } | null {
  if (!fieldKey) return null;
  return FOREIGN_NATURE_SHEETS[fieldKey] ?? null;
}

export const FORM100_INSTRUCTIONS = {"""

s = s.replace(anchor, addition)

old = """  foreignCredit: {
    page: 19,
    sheet: 'RD',
    caseNumber: '1081/1082',
    kind: 'INSTRUCTION',
  },"""

new = """  foreignCredit: {
    page: 19,
    sheet: 'RD',
    caseNumber: '1081/1082',
    kind: 'INSTRUCTION',
  },
  /**
   * The exempt-income pointer for a known foreign nature: same credit page, but
   * the sheet named is the one the income actually belongs on.
   */
  foreignCreditOnSheet: (sheet: string, page: number) =>
    ({
      page,
      sheet,
      caseNumber: 'exempt income column',
      kind: 'INSTRUCTION',
    }) as const,"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline=nl).write(s.replace("\n", nl))
print("ok, newline =", repr(nl))
