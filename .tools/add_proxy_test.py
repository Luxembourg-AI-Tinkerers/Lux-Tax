import io

p = r"B:\B\tax-app\tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = '    "apps/api/test/prod2-source-invariant.spec.ts",\n'
new = (
    old
    + '    "apps/api/src/config/proxy-trust.ts",\n'
    + '    "apps/api/test/proxy-trust.spec.ts",\n'
)
assert t.count(old) == 1, "include anchor"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("tsconfig.test.json: proxy test registered")
