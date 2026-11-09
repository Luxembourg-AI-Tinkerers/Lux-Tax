import io
p = "apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("""<strong className="text-xs text-slate-700">2025</strong>""",
    """<strong className="text-xs text-slate-700">{selectedYear}</strong>""")

rep("""Deterministic 2025""", """Deterministic engine""")

out = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("ok")
