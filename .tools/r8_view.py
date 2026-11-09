import io
p = "apps/web/src/components/FilingPackageView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """                {filingPackage.myGuichetGuide.map((step) => ("""
block = """                {filingPackage.annexes.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
                    <h3 className="text-sm font-bold text-indigo-950 mb-1">
                      Required ACD annexes ({filingPackage.annexes.length})
                    </h3>
                    <p className="text-[11px] text-indigo-800 mb-3">
                      The app supplies the values; the official annex PDF is not generated. Carry them into the
                      corresponding ACD annex.
                    </p>
                    <div className="space-y-3">
                      {filingPackage.annexes.map((annex) => (
                        <div key={annex.code} className="rounded-lg bg-white border border-indigo-100 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {annex.code} — {annex.title}
                            </span>
                            <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              data only
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">{annex.reason}</p>
                          <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                            {annex.fields.map((f) => (
                              <div key={f.label} className="flex justify-between border-b border-slate-100 py-0.5">
                                <span className="text-slate-500">{f.label}</span>
                                <span className="font-semibold">{f.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filingPackage.myGuichetGuide.map((step) => ("""
assert s.count(anchor) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(anchor, block).replace("\n", "\r\n"))
print("ok")
