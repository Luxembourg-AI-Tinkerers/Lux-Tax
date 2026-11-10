import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.controller.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = (
    "      {\n"
    "        ipAddress: req.ip || req.headers?.['x-forwarded-for'],\n"
    "        userAgent: req.headers?.['user-agent'],\n"
    "      },\n"
)
new = (
    "      {\n"
    "        // L6: `req.ip` is the socket address unless the adapter was built with\n"
    "        // `trustProxy` (main.ts), in which case Fastify has already resolved\n"
    "        // the header against the configured hops/networks. Reading\n"
    "        // `x-forwarded-for` here as well would bypass that decision and let any\n"
    "        // caller write an arbitrary address into the audit trail.\n"
    "        ipAddress: req.ip,\n"
    "        userAgent: req.headers?.['user-agent'],\n"
    "      },\n"
)
assert t.count(old) == 1, "login meta anchor"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("auth.controller.ts: no longer reads x-forwarded-for directly")
