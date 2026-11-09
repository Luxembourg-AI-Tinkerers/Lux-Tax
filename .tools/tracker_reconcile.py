import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

# 1) correct the stale "48" claim in my own verification log with the measured figure
rep("""| 2026-11-08 | Combined run after the CIC safety gate | ✅ **48 / 48 pass** |""",
"""| 2026-11-08 | Combined run after the CIC safety gate | ✅ **48 / 48 pass** (engine + annex PDF scope of this track) |
| 2026-11-09 | Full repo suite (all 10 spec files present) | ✅ **188 / 189 pass** — the single failure is `packages/validation/test/validation.spec.ts`, which imports `../dist/index.js` (not built) and needs `zod` (no `node_modules`); environment artefact, not a logic failure |""")

# 2) record the publication re-check for today in the R6/R7 status block
rep("""> **Status of R6 / R7: BLOCKED (external).** Re-checked on 2026-11-09: no change.""",
"""> **Status of R6 / R7: BLOCKED (external).** Re-checked on 2026-11-09 (new day, fresh fetch):
> `legi26.html` still ends at the loi du 16 juillet 2026 and `chd.lu/fr/dossier/8775` is still
> “Déposé 22.06.2026”, “Dernière mise à jour · 22.06.2026”. No change.""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
