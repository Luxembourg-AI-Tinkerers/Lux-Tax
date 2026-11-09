import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/api/test/filing-year-guard.spec.ts"', '"apps/api/test/filing-year-guard.spec.ts",\n    "apps/api/test/filing-package-evidence.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
