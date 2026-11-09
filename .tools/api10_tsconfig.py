import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/api/test/calculation-history.spec.ts"', '"apps/api/test/calculation-history.spec.ts",\n    "apps/api/test/audit-chain.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
