import io
p = "apps/web/src/components/FilingPackageView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """                    <h3 className="text-sm font-bold text-indigo-950 mb-1">
                      Required ACD annexes ({filingPackage.annexes.length})
                    </h3>"""
new = """                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-bold text-indigo-950 mb-1">
                        Required ACD annexes ({filingPackage.annexes.length})
                      </h3>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                      >
                        Print / Save as PDF
                      </button>
                    </div>"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
