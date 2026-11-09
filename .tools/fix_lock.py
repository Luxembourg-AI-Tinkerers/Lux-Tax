import io
io.open("apps/api/prisma/migrations/migration_lock.toml", "w", encoding="utf-8", newline="\n").write('provider = "postgresql"\n')
print(repr(io.open("apps/api/prisma/migrations/migration_lock.toml", encoding="utf-8", newline="").read()))
