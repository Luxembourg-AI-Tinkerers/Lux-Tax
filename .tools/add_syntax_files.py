import io

p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"

target = '  "packages/validation/src/questionnaire.schema.ts",'
assert s.count(target) == 1
s = s.replace(
    target,
    target + nl
    + '  "packages/tax-engine/src/pending.ts",' + nl
    + '  "packages/tax-engine/test/pending.spec.ts",',
)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("patched")
