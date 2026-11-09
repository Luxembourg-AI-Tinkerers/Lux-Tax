import io
p = ".tools/syntax_check.cjs"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace('  "apps/mobile/app/(tabs)/tasks.tsx",',
'''  "apps/mobile/app/(tabs)/tasks.tsx",
  "apps/mobile/src/components/OfflineBanner.tsx",
  "apps/mobile/src/components/AppLockScreen.tsx",''')
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
