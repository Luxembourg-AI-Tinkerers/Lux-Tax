import io

p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

# 1) Render the couple block right after the marital-status buttons block.
anchor = """          {/* Art. 119 n° 3 b–c: three-year Class 2 window after death / divorce */}
"""
assert s.count(anchor) == 1, s.count(anchor)

block = """          {/* Art. 3 d) — mixed couple: where the spouse lives, and the collective request */}
          {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                Where does your spouse live?
              </label>
              <select
                value={answers.spouseResidence ?? ''}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    spouseResidence: (e.target.value || undefined) as
                      | 'RESIDENT'
                      | 'NON_RESIDENT'
                      | undefined,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                <option value="">Same country as me</option>
                <option value="RESIDENT">Luxembourg (resident)</option>
                <option value="NON_RESIDENT">Abroad (non-resident)</option>
              </select>

              {answers.spouseResidence &&
                answers.spouseResidence !== (answers.nonResidentAssimilation ? 'NON_RESIDENT' : 'RESIDENT') && (
                  <label className="flex items-start gap-2 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={answers.mixedCoupleCollectiveRequested ?? false}
                      onChange={(e) =>
                        setAnswers({ ...answers, mixedCoupleCollectiveRequested: e.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>
                      Request collective assessment (Art. 3 d). Granted only when the resident spouse
                      earns at least 90 % of the household&apos;s professional income in Luxembourg;
                      otherwise the couple is taxed separately and the calculation says so.
                    </span>
                  </label>
                )}
            </div>
          )}

""" + anchor

s = s.replace(anchor, block, 1)
if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ui patched")
