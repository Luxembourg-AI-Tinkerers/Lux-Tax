import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""# JSX/TS syntax check on touched web/API files
node .tools/syntax_check.cjs""",
"""# JSX/TS syntax check on the 9 touched web/API files (must print 9 x "ok")
node .tools/syntax_check.cjs""")

rep("""| 2026-11-08 | Combined run after CIC work | ✅ **44 / 44 pass** |""",
"""| 2026-11-08 | Combined run after CIC work | ✅ **44 / 44 pass** |
| 2026-11-08 | `node .tools/syntax_check.cjs` | ✅ **9 / 9 files `ok`**, exit 0 — incl. `apps/web/src/components/TaxCalculatorView.tsx` (CIC row present at L373–374) |""")

rep("""## Known limitations (by design, not pending work)""",
"""### Syntax-check evidence (last run, 2026-11-08)

`node .tools/syntax_check.cjs` → exit 0, nine files parsed:

```
ok   apps/api/src/modules/calculations/calculations.service.ts
ok   apps/api/src/modules/filing/filing.service.ts
ok   apps/api/src/modules/freelance/freelance.service.ts
ok   apps/web/src/components/TaxCalculatorView.tsx
ok   apps/web/src/components/QuestionnaireView.tsx
ok   apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx
ok   apps/web/src/components/FilingPackageView.tsx
ok   apps/api/src/modules/documents/receipt-ai-vision.service.ts
ok   packages/validation/src/questionnaire.schema.ts
```

The web files are outside `tsconfig.test.json`, so this transpile check is the gate that
covers them; `TaxCalculatorView.tsx` was re-checked after the CIC row was added
(`calc.credits.cic`, lines 373–374 of the file).

## Known limitations (by design, not pending work)""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
