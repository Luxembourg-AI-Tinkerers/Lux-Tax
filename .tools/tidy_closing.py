import io

p = "implementation-tracker.md"
s = io.open(p, encoding="utf-8", newline="").read()
old = "Totals: 414 tests, two `tsc`\r\nconfigurations at exit 0, 56 files syntax `ok` — 414 tests."
new = "Totals: 414 tests, two `tsc` configurations at exit 0, 56 files syntax `ok`."
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
