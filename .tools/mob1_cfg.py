import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/api/test/mfa-totp.spec.ts"', '"apps/api/test/mfa-totp.spec.ts",\n    "apps/mobile/src/lib/workspace.ts",\n    "apps/mobile/test/workspace.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

p2 = ".tools/syntax_check.cjs"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace('  "apps/api/src/modules/documents/receipt-ai-vision.service.ts",',
'''  "apps/api/src/modules/documents/receipt-ai-vision.service.ts",
  "apps/mobile/app/(tabs)/estimate.tsx",
  "apps/mobile/app/(tabs)/documents.tsx",
  "apps/mobile/src/components/DocumentCameraScanner.tsx",
  "apps/mobile/src/lib/workspace.ts",''')
io.open(p2, "w", encoding="utf-8", newline="").write(s2)
print("ok")
