import io

# Questionnaire: two inputs in the scroll of fields (after the 111bis contributors block)
p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  111bis souscripteurs (1 or 2)
                </span>"""
add = """              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prime jeune salarié received (€, Art. 115 n° 13d)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.youngEmployeePrime ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, youngEmployeePrime: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prime jeune salarié conditions met?
                </span>
                <select
                  value={answers.youngEmployeePrimeEligible ? 'yes' : 'no'}
                  onChange={(e) => setAnswers({ ...answers, youngEmployeePrimeEligible: e.target.value === 'yes' })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                >
                  <option value="no">No / not applicable</option>
                  <option value="yes">Under 30, first CDI in LU, first prime &lt; 5 years</option>
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  111bis souscripteurs (1 or 2)
                </span>"""
assert s.count(anchor) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(anchor, add).replace("\n", "\r\n"))

# Calculator: one row after the CIC row
p2 = "apps/web/src/components/TaxCalculatorView.tsx"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CISSM (salaire social minimum)</span>"""
new2 = """              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Prime jeune salarié (exempt, Art. 115 n°13d)</span>
                <span className="font-semibold">€{(calc.youngEmployeePrimeExemption ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CISSM (salaire social minimum)</span>"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))
print("ok")
