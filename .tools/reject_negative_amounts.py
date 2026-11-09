import io

p = "packages/tax-engine/src/engine.ts"
t = io.open(p, encoding="utf-8", newline="").read()

old = (
    "    for (const fact of facts) {\r\n"
    "      const amount = Number(fact.amount) || 0;\r\n"
    "      const bucket = ownerBucket(fact.ownerId);\r\n"
)
new = (
    "    for (const fact of facts) {\r\n"
    "      const amount = Number(fact.amount) || 0;\r\n"
    "      const bucket = ownerBucket(fact.ownerId);\r\n\r\n"
    "      // A negative amount is not a correction mechanism: netting it against other income would\r\n"
    "      // silently reduce the return (and could drive gross income below zero). Refuse it and say\r\n"
    "      // so, rather than letting a sign error propagate into the figures.\r\n"
    "      if (amount < 0) {\r\n"
    "        warnings.push(\r\n"
    "          `Fact ${fact.id} has a negative amount (${amount}) and was ignored. Enter the correction ` +\r\n"
    "            'as a positive amount in the right box; a sign error must not reduce another income line.',\r\n"
    "        );\r\n"
    "        continue;\r\n"
    "      }\r\n"
)
assert t.count(old) == 1
t = t.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(t)
print("patched")
