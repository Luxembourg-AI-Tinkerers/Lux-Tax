import io
p = "apps/web/src/components/TaxCalculatorView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIM (single parent)</span>"""
new = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CISSM (salaire social minimum)</span>
                <span className="font-semibold">-€{calc.credits.cissm.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Foreign tax credit</span>
                <span className="font-semibold">-€{calc.credits.foreignTaxCredit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIM (single parent)</span>"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
