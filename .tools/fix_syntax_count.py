import io

p = "implementation-tracker.md"
s = io.open(p, encoding="utf-8", newline="").read()
s = s.replace("67 files syntax `ok`", "66 files syntax `ok`")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("occurrences of 67 left:", s.count("67 files"))
