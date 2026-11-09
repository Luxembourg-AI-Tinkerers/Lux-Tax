import io
p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

# 1) four scalars into the existing grid, right after the moderation-children input block
anchor = """              <div>
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
              </div>"""
addition = anchor + """

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reduced working capacity (0–1, invalidity forfait)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.invalidityRatePrimary ?? ''}
                  placeholder="e.g. 0.40"
                  onChange={(e) =>
                    setAnswers({ ...answers, invalidityRatePrimary: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={1}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Épargne-logement subscriber age on 1 January
                </span>
                <input
                  type="number"
                  value={answers.savingsHousingSubscriberAge ?? ''}
                  placeholder="≤ 40 gives €1,344"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      savingsHousingSubscriberAge: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  111bis souscripteurs (1 or 2)
                </span>
                <input
                  type="number"
                  value={answers.art111bisContributors ?? ''}
                  placeholder="default 2 if married"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      art111bisContributors: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={1}
                  max={2}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Allocations paid for the child (CIM reduction, €)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.childAllocations ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, childAllocations: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>"""
rep(anchor, addition)

# 2) gains + foreign block before the assessment select
anchor2 = """            {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && ("""
block2 = """            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                Gains and foreign income (one row each)
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Movable: proceeds €</span>
                  <input type="number" step="0.01" value={answers.movableGainProceeds ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainProceeds: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Movable: cost €</span>
                  <input type="number" step="0.01" value={answers.movableGainCost ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Held (months)</span>
                  <input type="number" value={answers.movableGainHoldingMonths ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainHoldingMonths: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Participation %</span>
                  <input type="number" step="0.01" value={answers.movableGainParticipationPercent ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainParticipationPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} max={100} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Real estate: proceeds €</span>
                  <input type="number" step="0.01" value={answers.realEstateGainProceeds ?? ''}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainProceeds: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Real estate: cost €</span>
                  <input type="number" step="0.01" value={answers.realEstateGainCost ?? ''}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Held (years)</span>
                  <input type="number" value={answers.realEstateGainHoldingYears ?? ''}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainHoldingYears: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Principal residence?</span>
                  <select value={answers.realEstateGainPrincipalResidence ? 'yes' : 'no'}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainPrincipalResidence: e.target.value === 'yes' })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                    <option value="no">No</option>
                    <option value="yes">Yes (exempt)</option>
                  </select>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign country (ISO)</span>
                  <input type="text" maxLength={2} value={answers.foreignCountry ?? ''}
                    placeholder="FR / DE / BE"
                    onChange={(e) => setAnswers({ ...answers, foreignCountry: e.target.value.toUpperCase() })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign amount €</span>
                  <input type="number" step="0.01" value={answers.foreignAmount ?? ''}
                    onChange={(e) => setAnswers({ ...answers, foreignAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign tax paid €</span>
                  <input type="number" step="0.01" value={answers.foreignTax ?? ''}
                    onChange={(e) => setAnswers({ ...answers, foreignTax: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
              </div>
            </div>

            {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && ("""
rep(anchor2, block2)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
