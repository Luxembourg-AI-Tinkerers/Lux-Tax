import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/mobile/test/app-lock.spec.ts"', '"apps/mobile/test/app-lock.spec.ts",\n    "apps/mobile/src/lib/file-export.ts",\n    "apps/mobile/test/file-export.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
