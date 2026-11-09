import io
p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                Gains and foreign income (one row each)
              </p>"""
block = """            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                Capital and rental (one row each)
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Securities income €</span>
                  <input type="number" step="0.01" value={answers.securitiesGrossIncome ?? ''}
                    onChange={(e) => setAnswers({ ...answers, securitiesGrossIncome: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Qualifying dividend?</span>
                  <select value={answers.securitiesQualifying ? 'yes' : 'no'}
                    onChange={(e) => setAnswers({ ...answers, securitiesQualifying: e.target.value === 'yes' })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                    <option value="no">No</option>
                    <option value="yes">Yes (50 % exempt, Art. 115 n°15a)</option>
                  </select>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign tax on it €</span>
                  <input type="number" step="0.01" value={answers.securitiesForeignTax ?? ''}
                    onChange={(e) => setAnswers({ ...answers, securitiesForeignTax: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">RELIBI 20 % withheld €</span>
                  <input type="number" step="0.01" value={answers.securitiesRelibiWithheld ?? ''}
                    onChange={(e) => setAnswers({ ...answers, securitiesRelibiWithheld: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Rent received €</span>
                  <input type="number" step="0.01" value={answers.rentalGrossRent ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalGrossRent: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Rental charges €</span>
                  <input type="number" step="0.01" value={answers.rentalCharges ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalCharges: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Purchase price €</span>
                  <input type="number" step="0.01" value={answers.rentalPurchasePrice ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalPurchasePrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Completion year</span>
                  <input type="number" value={answers.rentalCompletionYear ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalCompletionYear: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={1800} max={2100} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Energy renovation €</span>
                  <input type="number" step="0.01" value={answers.rentalEnergyRenovationAmount ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalEnergyRenovationAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Loan interest on it €</span>
                  <input type="number" step="0.01" value={answers.rentalInterest ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalInterest: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
              </div>
              <label className="mt-2 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={answers.relibiFinalElective ?? false}
                  onChange={(e) => setAnswers({ ...answers, relibiFinalElective: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                <span className="text-xs font-medium text-slate-800">
                  Treat the 20 % RELIBI withholding as final (interest excluded from the base)
                </span>
              </label>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                Gains and foreign income (one row each)
              </p>"""
assert s.count(anchor) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(anchor, block).replace("\n", "\r\n"))
print("ok")
