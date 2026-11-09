import io
p = "apps/api/prisma/migrations/20261108130000_add_filing_annexes/migration.sql"
s = io.open(p, encoding="utf-8-sig", newline="").read()
s = s.replace('"annexes_json"', '"annexesJson"')
io.open(p, "w", encoding="utf-8", newline="\n").write(s.lstrip("\ufeff"))
print(s)
