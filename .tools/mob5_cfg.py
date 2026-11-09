import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/mobile/test/queue-runtime.spec.ts"', '"apps/mobile/test/queue-runtime.spec.ts",\n    "apps/mobile/src/lib/privacy.ts",\n    "apps/mobile/test/privacy.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
