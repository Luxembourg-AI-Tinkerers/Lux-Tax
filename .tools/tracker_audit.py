import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""| 2026-11-09 | Full repo suite (all 10 spec files present) | ✅ **188 / 189 pass**""",
"""| 2026-11-09 | Completion audit (suites + tsc + syntax) | suites **189 / pass 188 / fail 1** · `tsc` exit 0 · syntax 45 files `ok` — unchanged |
| 2026-11-09 | Full repo suite (all 10 spec files present) | ✅ **188 / 189 pass**""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
