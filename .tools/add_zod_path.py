import io, json

p = "tsconfig.test.json"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
needle = '      "react-native": [".tools/rn-shim/index.js"]'
assert s.count(needle) == 1
s = s.replace(needle, needle + ',\n      "zod": [".tools/node_modules/zod"]', 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
json.loads(io.open(p, encoding="utf-8").read())
print("ok")
