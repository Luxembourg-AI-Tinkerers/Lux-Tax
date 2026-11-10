import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}'
new = (
    "// Prisma 7 reads the connection URL from prisma.config.ts; a `url` here is\n"
    "// rejected by the CLI the project pins (prisma@7.10.0), which made\n"
    "// `prisma generate` impossible and, with it, any run of the API.\n"
    'datasource db {\n  provider = "postgresql"\n}'
)

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
