import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace('"apps/mobile/test/workspace.spec.ts"', '"apps/mobile/test/workspace.spec.ts",\n    "apps/mobile/test/client-methods.spec.ts"')
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

p2 = ".tools/syntax_check.cjs"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace('  "apps/mobile/src/lib/workspace.ts",', '  "apps/mobile/src/lib/workspace.ts",\n  "apps/mobile/app/(tabs)/tasks.tsx",')
io.open(p2, "w", encoding="utf-8", newline="").write(s2)
print("ok")
