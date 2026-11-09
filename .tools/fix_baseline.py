import io
p = ".tools/schema-baseline.prisma"
s = io.open(p, encoding="utf-8", newline="").read()
old = 'datasource db {\n  provider = "postgresql"\n}'
new = 'datasource db {\n  provider = "postgresql"\n  url      = "postgresql://postgres@127.0.0.1:55432/luxtax?schema=public"\n}'
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="\n").write(s.replace(old, new))
print("ok")
