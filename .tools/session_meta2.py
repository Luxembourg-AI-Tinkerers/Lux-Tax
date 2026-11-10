import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

pairs = [
    # register
    (
        "    const tokens = await this.generateTokens(user.id, user.email);\n",
        "    const tokens = await this.generateTokens(user.id, user.email, 0, undefined, meta);\n",
    ),
    # login
    (
        "    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);\n",
        "    const tokens = await this.generateTokens(\n"
        "      user.id,\n"
        "      user.email,\n"
        "      user.tokenVersion,\n"
        "      undefined,\n"
        "      meta,\n"
        "    );\n",
    ),
    # refresh (rotation keeps the family)
    (
        "    const tokens = await this.generateTokens(\n"
        "      session.user.id,\n"
        "      session.user.email,\n"
        "      session.user.tokenVersion,\n"
        "      session.familyId ?? undefined,\n"
        "    );\n",
        "    const tokens = await this.generateTokens(\n"
        "      session.user.id,\n"
        "      session.user.email,\n"
        "      session.user.tokenVersion,\n"
        "      session.familyId ?? undefined,\n"
        "      meta,\n"
        "    );\n",
    ),
]

for old, new in pairs:
    assert t.count(old) == 1, old[:60]
    t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("auth.service.ts: meta threaded into every token issue")
