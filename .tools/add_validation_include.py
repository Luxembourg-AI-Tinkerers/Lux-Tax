import io, json

p = "tsconfig.test.json"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = '    "packages/tax-engine/src/**/*.ts",'
assert s.count(anchor) == 1
s = s.replace(
    anchor,
    '    "packages/validation/src/**/*.ts",\n'
    + '    "packages/validation/test/**/*.ts",\n'
    + anchor,
    1,
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
json.loads(io.open(p, encoding="utf-8").read())
print("ok")
