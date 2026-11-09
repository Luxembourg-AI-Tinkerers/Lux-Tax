import io
s = io.open("apps/api/prisma/schema.prisma", encoding="utf-8", newline="").read().replace("\r\n", "\n")
old = 'datasource db {\n  provider = "postgresql"\n}'
new = 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}'
assert s.count(old) == 1, s[:200]
io.open("apps/api/prisma/schema.deploy.prisma", "w", encoding="utf-8", newline="\n").write(s.replace(old, new))
print("ok")
