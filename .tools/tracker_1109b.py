import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""> **Status of R6 / R7: BLOCKED (external).** Re-checked on 2026-11-09 (new day, fresh fetch):
> `legi26.html` still ends at the loi du 16 juillet 2026 and `chd.lu/fr/dossier/8775` is still
> “Déposé 22.06.2026”, “Dernière mise à jour · 22.06.2026”. No change.""",
"""> **Status of R6 / R7: BLOCKED (external).** Re-checked twice on 2026-11-09:
> `legi26.html` still ends at the loi du 16 juillet 2026 and `chd.lu/fr/dossier/8775` is still
> “Déposé 22.06.2026”, “Dernière mise à jour · 22.06.2026”. No change.
> The watch (`861a3eef…`, revision 2, **enabled**) is the standing mechanism: it runs at
> 08:00 Europe/Luxembourg, stays read-only, and reports the morning 8775 appears.
> No code change results from these re-checks, so the suite is unchanged at 188 / 189.""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
