import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

s = s.replace("""  cipForPension,
  cissmForSalary,""", """  cipForPension,
  cissmForSalary,
  cicForSalary,""")

anchor = """  test('CIP and CII floors', () => {"""
block = """  test('CIC: no table published -> no credit, mechanism ready', () => {
    // Both packages deliberately carry no CIC table: the 2026 table is not published.
    close(cicForSalary(60_000, pkg2025), 0);
    close(cicForSalary(60_000, pkg2026), 0);

    // Mechanism check with a synthetic table (NOT a legal table): flat 10/month
    // from 1 000 to 2 000, 20/month above.
    const synthetic = {
      ...pkg2026,
      cic: {
        bands: [{ from: 1_000, to: 2_000, slope: 0, offset: 10 }],
        topAmount: 20,
      },
    };
    close(cicForSalary(12 * 1_500, synthetic), 120);
    close(cicForSalary(12 * 3_000, synthetic), 240);
    close(cicForSalary(12 * 500, synthetic), 0);
  });

  test('CIP and CII floors', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# UI row
p2 = "apps/web/src/components/TaxCalculatorView.tsx"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CISSM (salaire social minimum)</span>"""
new2 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIC (crédit d'impôt conjoncture)</span>
                <span className="font-semibold">-€{calc.credits.cic.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CISSM (salaire social minimum)</span>"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))
print("ok")
