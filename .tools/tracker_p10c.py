import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""| 2026-11-08 | ACD “Lois votées en 2026” list · Legilux ELI probe | ⛔ 8775 absent — last law 16.07.2026 (Mémorial A 360); ELI 404 |""",
"""| 2026-11-08 | ACD “Lois votées en 2026” list · Legilux ELI probe | ⛔ 8775 absent — last law 16.07.2026 (Mémorial A 360); ELI 404 |
| 2026-11-08 (re-check) | `legi26.html` + `chd.lu/fr/dossier/8775` | ⛔ **no change** — law list still ends 16.07.2026; dossier still “Déposé 22.06.2026”, last update 22.06.2026 |""")

rep("""> **Status of R6 / R7: BLOCKED (external).** Not unfinished code, not a missing
> implementation.""",
"""> **Status of R6 / R7: BLOCKED (external).** Re-checked again on 2026-11-08: no change.
> Not unfinished code, not a missing implementation.""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
