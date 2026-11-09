import io, json

p = "tsconfig.test.json"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = '    "apps/web/test/tax-calculator-view.spec.ts",'
assert s.count(anchor) == 1
s = s.replace(
    anchor,
    anchor
    + '\n    "apps/web/src/components/QuestionnaireView.tsx",'
    + '\n    "apps/web/test/questionnaire-view.spec.ts",',
    1,
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
json.loads(io.open(p, encoding="utf-8").read())
print("ok")
