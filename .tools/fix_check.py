import io
p = ".tools/syntax_check.cjs"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace('  "apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx",',
'  "apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx",\n  "apps/web/src/components/FilingPackageView.tsx",\n  "apps/api/src/modules/documents/receipt-ai-vision.service.ts",')
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
