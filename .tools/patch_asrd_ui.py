import io

# contracts: add asrd to DeductionBreakdownDto
p = "packages/contracts/src/tax.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  art111: number;
  art111bis: number;"""
new = """  art111: number;
  /** ASRD single-premium majoration (outside the EUR 672 envelope). */
  asrd: number;
  art111bis: number;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# engine: map asrd
p2 = "packages/tax-engine/src/engine.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """      art111: d.art111Deduction,
      art111bis: d.art111bisDeduction,"""
new2 = """      art111: d.art111Deduction,
      asrd: d.asrdDeduction,
      art111bis: d.art111bisDeduction,"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))

# UI: add rows
p3 = "apps/web/src/components/TaxCalculatorView.tsx"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
old3 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Art. 111bis third pillar</span>
                <span className="font-semibold">-€{calc.deductions.art111bis.toFixed(2)}</span>
              </div>"""
new3 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">ASRD single premium (Art. 111 al. 3/4)</span>
                <span className="font-semibold">-€{calc.deductions.asrd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Art. 111bis third pillar</span>
                <span className="font-semibold">-€{calc.deductions.art111bis.toFixed(2)}</span>
              </div>"""
assert s3.count(old3) == 1
s3 = s3.replace(old3, new3)

old4 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIM (single parent)</span>
                <span className="font-semibold">-€{calc.credits.cim.toFixed(2)}</span>
              </div>"""
new4 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIM (single parent)</span>
                <span className="font-semibold">-€{calc.credits.cim.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Start-up credit (2026)</span>
                <span className="font-semibold">-€{calc.credits.startup.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Rental net (Art. 98)</span>
                <span className="font-semibold">€{(calc.rental?.net ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Plus-values taxed at the demi-taux</span>
                <span className="font-semibold">€{(calc.plusValues?.taxableExtraordinary ?? 0).toFixed(2)}</span>
              </div>"""
assert s3.count(old4) == 1
s3 = s3.replace(old4, new4)
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace("\n", "\r\n"))
print("ok")
