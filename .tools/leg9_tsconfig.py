import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """      "@luxtax/contracts": ["packages/contracts/src/index.ts"]"""
new = """      "@luxtax/contracts": ["packages/contracts/src/index.ts"],
      "@luxtax/tax-engine": ["packages/tax-engine/src/index.ts"]"""
if s.count(old) != 1:
    old = """      "@luxtax/contracts": ["./packages/contracts/src/index.ts"]"""
    new = """      "@luxtax/contracts": ["./packages/contracts/src/index.ts"],
      "@luxtax/tax-engine": ["./packages/tax-engine/src/index.ts"]"""
assert s.count(old) == 1, s
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
