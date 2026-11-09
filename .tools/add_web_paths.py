import io, json

p = "tsconfig.test.json"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")

needle = '      "@luxtax/tax-engine": ["packages/tax-engine/src/index.ts"],'
assert s.count(needle) == 1
s = s.replace(
    needle,
    needle
    + '\n      "@luxtax/api-client": ["packages/api-client/src/index.ts"],'
    + '\n      "@luxtax/design-tokens": ["packages/design-tokens/src/index.ts"],',
    1,
)

inc = '    "apps/mobile/src/lib/workspace.ts",'
assert s.count(inc) == 1
s = s.replace(
    inc,
    '    "apps/web/src/lib/fact-inclusion.ts",\n'
    + '    "apps/web/test/fact-inclusion.spec.ts",\n'
    + '    "apps/web/src/components/TaxCalculatorView.tsx",\n'
    + '    "apps/web/test/tax-calculator-view.spec.ts",\n'
    + '    "packages/design-tokens/src/translations.ts",\n'
    + '    "packages/design-tokens/test/translations.spec.ts",\n'
    + inc,
    1,
)

s = s.replace('    "strict": true,', '    "strict": true,\n    "jsx": "react-jsx",', 1)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
json.loads(io.open(p, encoding="utf-8").read())
print("ok")
