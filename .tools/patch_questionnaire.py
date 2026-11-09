import io
p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""          Guided Household Tax Questionnaire (2025)""",
    """          Guided household tax questionnaire""")

rep("""                      <span className="block text-[11px] font-semibold text-slate-600 mb-1">Year of First Occupation:</span>""",
    """                      <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Year the valeur locative was fixed (not the occupation year):
                      </span>""")

rep("""                        min={1970}
                        max={2025}""",
    """                        min={1970}
                        max={2030}""")

rep("""                  Life Insurance / Private Pension Plans (Art 111 / 111bis LIR)""",
    """                  Private insurance / consumer-loan interest (Art. 111 — €672 envelope)""")

# Insert new household section before Children block
rep("""          {/* Children & Dependants */}""",
"""          {/* Household & professional profile (drives class, AEP, plafonds) */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Household &amp; professional profile
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Your age on 1 January
                </span>
                <input
                  type="number"
                  value={answers.primaryAge ?? ''}
                  placeholder="e.g. 42"
                  onChange={(e) =>
                    setAnswers({ ...answers, primaryAge: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Spouse age on 1 January
                </span>
                <input
                  type="number"
                  value={answers.spouseAge ?? ''}
                  placeholder="e.g. 40"
                  onChange={(e) =>
                    setAnswers({ ...answers, spouseAge: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Unités d'éloignement — you (Art. 105bis)
                </span>
                <input
                  type="number"
                  value={answers.travelUnitsPrimary ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, travelUnitsPrimary: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={60}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Unités d'éloignement — spouse
                </span>
                <input
                  type="number"
                  value={answers.travelUnitsSpouse ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, travelUnitsSpouse: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={60}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prior-year losses carried forward (Art. 114, €)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.priorYearLosses ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, priorYearLosses: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Children with a modération d'impôt
                </span>
                <input
                  type="number"
                  value={answers.childrenWithModeration ?? ''}
                  placeholder="same as dependants"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      childrenWithModeration: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={20}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.spouseHasProfessionalIncome ?? false}
                  onChange={(e) => setAnswers({ ...answers, spouseHasProfessionalIncome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse also has professional income (salary or side-business) — Art. 129b AEP €4,500
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.spouseIsConjointAidant ?? false}
                  onChange={(e) => setAnswers({ ...answers, spouseIsConjointAidant: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse is registered as conjoint-aidant in my business
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.bothParentsSameHome ?? false}
                  onChange={(e) => setAnswers({ ...answers, bothParentsSameHome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Both parents live in the same home as the child (excludes the CIM)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.hasPensionSavingsContract ?? false}
                  onChange={(e) => setAnswers({ ...answers, hasPensionSavingsContract: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I hold a prévoyance-vieillesse contract (Art. 111bis — cap €3,200 for 2025, €4,500 from 2026)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.hasSavingsHousingContract ?? false}
                  onChange={(e) => setAnswers({ ...answers, hasSavingsHousingContract: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I hold an épargne-logement contract (Art. 111 al. 5 — €1,344 / €672)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.amvpEligible ?? false}
                  onChange={(e) => setAnswers({ ...answers, amvpEligible: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I keep working after becoming eligible for an early pension — AMVP €9,000 (2026 only)
                </span>
              </label>
            </div>

            {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Assessment (Art. 3 / 3bis / 3ter)
                  </span>
                  <select
                    value={answers.assessmentMode ?? 'COLLECTIVE'}
                    onChange={(e) =>
                      setAnswers({ ...answers, assessmentMode: e.target.value as QuestionnaireAnswersDto['assessmentMode'] })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    <option value="COLLECTIVE">Collective (Class 2)</option>
                    <option value="INDIVIDUAL_PURE">Individual, pure (Class 1 each)</option>
                    <option value="INDIVIDUAL_REALLOCATION">Individual with reallocation</option>
                  </select>
                </div>
                {answers.assessmentMode === 'INDIVIDUAL_REALLOCATION' && (
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Your share of the joint income (%)
                    </span>
                    <input
                      type="number"
                      value={answers.reallocationPercentPrimary ?? 50}
                      onChange={(e) =>
                        setAnswers({ ...answers, reallocationPercentPrimary: parseFloat(e.target.value) || 50 })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                      min={0}
                      max={100}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Children & Dependants */}""")

out = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched")
