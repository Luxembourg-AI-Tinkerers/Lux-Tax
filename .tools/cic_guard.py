import io
p = "packages/tax-engine/src/credits.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """export function cicForSalary(grossSalary: number, pkg: RulePackage): number {
  const table = pkg.cic;
  if (!table) return 0;"""
new = """export function cicForSalary(grossSalary: number, pkg: RulePackage): number {
  const table = pkg.cic;
  if (!table) return 0;

  // Safety gate: a table transcribed from a bill must never be paid out while the
  // measure is still flagged NOT_IN_FORCE. This prevents shipping the numbers of a
  // projet de loi as if they were law.
  const measure = (pkg.pendingMeasures ?? []).find((m) => m.id === 'CIC_2026');
  if (measure && measure.status === 'NOT_IN_FORCE') return 0;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
