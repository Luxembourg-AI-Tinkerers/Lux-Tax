import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.controller.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = "      ipAddress: req.ip || req.headers?.['x-forwarded-for'],\n"
new = (
    "      // L6: the adapter decides whether the header is trusted; never read it here.\n"
    "      ipAddress: req.ip,\n"
)
assert t.count(old) == 1, "register meta"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("register handler fixed")
