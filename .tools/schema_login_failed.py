import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# 1. enum value
old_enum = "  USER_LOGGED_IN\n  USER_LOGGED_OUT\n"
new_enum = "  USER_LOGGED_IN\n  USER_LOGIN_FAILED\n  USER_LOGGED_OUT\n"
assert t.count(old_enum) == 1, "enum anchor"
t = t.replace(old_enum, new_enum, 1)

# 2. actorId nullable
old_col = "  actorId       String          @db.Uuid\n"
new_col = "  /// Nullable: a rejected login for an unknown address has no actor.\n  actorId       String?         @db.Uuid\n"
assert t.count(old_col) == 1, "actorId column"
t = t.replace(old_col, new_col, 1)

# 3. relation optional
old_rel = '  actor         User            @relation("UserAuditEvents", fields: [actorId], references: [id])\n'
new_rel = '  actor         User?           @relation("UserAuditEvents", fields: [actorId], references: [id])\n'
assert t.count(old_rel) == 1, "actor relation"
t = t.replace(old_rel, new_rel, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("schema updated")
