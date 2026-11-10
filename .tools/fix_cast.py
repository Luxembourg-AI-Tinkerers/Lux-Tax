import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.controller.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "typeof (body as { totpCode?: unknown })?.totpCode === 'string'",
    "typeof (body as unknown as { totpCode?: unknown })?.totpCode === 'string'",
)
s = s.replace(
    "(body as { totpCode: string }).totpCode",
    "(body as unknown as { totpCode: string }).totpCode",
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
