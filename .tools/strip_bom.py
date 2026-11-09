import io, glob, os
for path in glob.glob("apps/api/prisma/migrations/*/migration.sql"):
    s = io.open(path, encoding="utf-8-sig", newline="").read()
    io.open(path, "w", encoding="utf-8", newline="\n").write(s.lstrip("\ufeff"))
    print(path, "ok", len(s))
