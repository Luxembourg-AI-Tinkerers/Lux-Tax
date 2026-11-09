import io, json, re

p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

needle = '      "@luxtax/tax-engine": ["packages/tax-engine/src/index.ts"]'
assert s.count(needle) == 1
s = s.replace(
    needle,
    needle + ',\n      "react-native": [".tools/rn-shim/index.js"]',
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# Validate the JSON still parses (comments/trailing commas would break it).
json.loads(io.open(p, encoding="utf-8").read())
print("paths patched, json valid")
