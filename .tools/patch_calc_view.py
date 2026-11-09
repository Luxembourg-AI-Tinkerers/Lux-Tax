import io
p = "apps/web/src/components/TaxCalculatorView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
orig = s

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""      showFeedback('success', '2025 Tax calculation completed successfully!');""",
"""      showFeedback('success', `${res.data.taxYear} tax calculation completed successfully!`);"""
)

rep(
"""            Deterministic Tax Engine (Tax Year 2025)""",
"""            Deterministic Tax Engine (Tax Year {calc?.taxYear ?? new Date().getFullYear()})"""
)

rep(
"""            Calculated strictly according to Article 118-121 LIR and published ACD scales.""",
"""            Calculated with the versioned rule package {calc?.rulePackageVersion ?? ''} — Art. 118–121, 120bis, 124, 126 LIR."""
)

rep(
"""            {calculating ? 'Running Tax Formulas...' : '⚡ Calculate 2025 Tax'}""",
"""            {calculating ? 'Running Tax Formulas...' : `⚡ Calculate ${calc?.taxYear ?? new Date().getFullYear()} Tax`}"""
)

# Unsupported banner after feedback block
rep(
"""      {/* Top Action Bar */}""",
"""      {/* Unsupported-scenario banner */}
      {calc && calc.unsupported.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900">
          <p className="font-bold mb-1">This scenario is not fully supported</p>
          <ul className="list-disc pl-4 space-y-1">
            {calc.unsupported.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
          <p className="mt-2 opacity-80">
            The figures below use resident rules only. Do not file from this estimate.
          </p>
        </div>
      )}

      {/* Top Action Bar */}"""
)

# Insert detailed legal breakdown before provenance accordion
rep(
"""          {/* Provenance Trace Accordion */}""",
"""          {/* Legal breakdown — every deduction and credit box */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900">Deduction and credit breakdown</h4>
              <span className="text-[11px] font-semibold text-slate-500">
                {calc.assessmentMode.replace('_', ' ')} · {calc.rulePackageVersion}
              </span>
            </div>

            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Net income (all categories)</span>
                <span className="font-semibold">€{calc.netIncome.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Frais d'obtention (Art. 105/107)</span>
                <span className="font-semibold">-€{calc.deductions.fraisObtention.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Déplacement (Art. 105bis)</span>
                <span className="font-semibold">-€{calc.deductions.travel.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Owner-occupier interest (Art. 98 n°5 / 105)</span>
                <span className="font-semibold">-€{calc.deductions.mortgageInterest.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Art. 111 insurance envelope (€672)</span>
                <span className="font-semibold">-€{calc.deductions.art111.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Art. 111bis third pillar</span>
                <span className="font-semibold">-€{calc.deductions.art111bis.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Épargne-logement</span>
                <span className="font-semibold">-€{calc.deductions.savingsHousing.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">LRCP (Art. 110 n°3)</span>
                <span className="font-semibold">-€{calc.deductions.lrcp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Dépenses spéciales (forfait {calc.deductions.specialExpensesForfait}€)</span>
                <span className="font-semibold">-€{calc.deductions.specialExpensesTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Charges extraordinaires (Art. 127)</span>
                <span className="font-semibold">-€{calc.deductions.extraordinaryCharges.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">AEP (Art. 129b)</span>
                <span className="font-semibold">-€{calc.deductions.aep.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Prior losses (Art. 114)</span>
                <span className="font-semibold">-€{calc.deductions.priorLosses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIS</span>
                <span className="font-semibold">-€{calc.credits.cis.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CI-CO2 salarié</span>
                <span className="font-semibold">-€{calc.credits.ciCo2Salary.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CII (independent)</span>
                <span className="font-semibold">-€{calc.credits.cii.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIM (single parent)</span>
                <span className="font-semibold">-€{calc.credits.cim.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 font-bold text-slate-900">
                <span>Taxable income</span>
                <span>€{calc.taxableIncome.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 font-bold text-slate-900">
                <span>Marginal / effective rate</span>
                <span>{(calc.marginalRate * 100).toFixed(0)}% / {calc.effectiveTaxRate.toFixed(1)}%</span>
              </div>
            </div>

            {calc.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {calc.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Provenance Trace Accordion */}"""
)

out = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched", len(orig), "->", len(s))
