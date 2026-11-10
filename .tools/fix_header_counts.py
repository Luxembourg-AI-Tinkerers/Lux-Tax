import io

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = "**820 unit tests across 80 spec files, 59 API e2e\ntests across 7 suites, 17 migrations"
new = "**826 unit tests across 81 spec files, 67 API e2e\ntests across 8 suites, 19 migrations"
assert t.count(old) == 1, "header"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("header counts updated")
