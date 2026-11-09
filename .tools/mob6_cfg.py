import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/mobile/test/privacy.spec.ts"', '"apps/mobile/test/privacy.spec.ts",\n    "apps/mobile/src/lib/package-download.ts",\n    "apps/mobile/test/package-download.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
