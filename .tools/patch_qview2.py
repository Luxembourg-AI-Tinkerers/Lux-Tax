import io
p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """            {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && ("""
block = """            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  ASRD single premium (€, Art. 111 al. 3/4)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.asrdPrimeUnique ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, asrdPrimeUnique: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Your age when the ASRD was taken out
                </span>
                <input
                  type="number"
                  value={answers.asrdSubscriberAge ?? ''}
                  placeholder="e.g. 35"
                  onChange={(e) =>
                    setAnswers({ ...answers, asrdSubscriberAge: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Start-up investment (2026, € — 20 % credit, cap €100,000)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.startupInvestment ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, startupInvestment: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.spouseEmployedByBusiness ?? false}
                  onChange={(e) => setAnswers({ ...answers, spouseEmployedByBusiness: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse is paid a salary by our business — Art. 48 n° 3 blocks the deduction in Class 2
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.rentalForfaitEligible ?? false}
                  onChange={(e) => setAnswers({ ...answers, rentalForfaitEligible: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Rental property: private patrimoine completed ≥ 15 years ago — 35 % forfait (max €2,700)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.rentalSocial ?? false}
                  onChange={(e) => setAnswers({ ...answers, rentalSocial: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Rental managed through a conventioned social agency — 90 % exempt (Art. 115 n° 22a)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.nonResidentAssimilation ?? false}
                  onChange={(e) => setAnswers({ ...answers, nonResidentAssimilation: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I am a non-resident asking for assimilation (≥ 90 % of worldwide income in Luxembourg, or foreign net &lt; €13,000)
                </span>
              </label>
            </div>

            {answers.nonResidentAssimilation && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Worldwide income (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.worldwideIncome ?? ''}
                    onChange={(e) =>
                      setAnswers({ ...answers, worldwideIncome: e.target.value ? parseFloat(e.target.value) : undefined })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                    min={0}
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Luxembourg professional income (€)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.luxembourgProfessionalIncome ?? ''}
                    onChange={(e) =>
                      setAnswers({
                        ...answers,
                        luxembourgProfessionalIncome: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                    min={0}
                  />
                </div>
              </div>
            )}

            {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && ("""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
