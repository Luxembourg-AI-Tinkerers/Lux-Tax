import io

p = "implementation-tracker.md"
s = io.open(p, encoding="utf-8", newline="").read()
old = "`tsc -p tsconfig.render.json` exit 0, **67 files** syntax `ok`."
new = "`tsc -p tsconfig.render.json` exit 0, **66 files** syntax `ok`."
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok, remaining 67:", s.count("67 files"))
