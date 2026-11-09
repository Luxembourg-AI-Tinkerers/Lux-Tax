import io
p = "packages/tax-engine/src/rules/index.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

s = s.replace("""import { RULES_2026 } from './2026';""",
"""import { RULES_2026 } from './2026';
import { RULES_2028 } from './2028';""")

s = s.replace("""export { RULES_2025, RULES_2026 };""",
"""export { RULES_2025, RULES_2026, RULES_2028 };""")

s = s.replace("""  2025: RULES_2025,
  2026: RULES_2026,
};""",
"""  2025: RULES_2025,
  2026: RULES_2026,
  2028: RULES_2028,
};""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
