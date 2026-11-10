import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# 1. extractedText becomes nullable: once every fact of a document is confirmed,
#    the raw snippet is no longer needed and is cleared.
old = "  extractedText String    @db.Text\n"
new = "  /// Nulled once every fact of this document is confirmed (data minimisation).\n  extractedText String?   @db.Text\n"
assert t.count(old) == 1, "extractedText column"
t = t.replace(old, new, 1)

# 2. Two lifecycle events.
old_enum = "  USER_LOGIN_FAILED\n"
new_enum = "  USER_LOGIN_FAILED\n  USER_DATA_EXPORTED\n  USER_ACCOUNT_ERASED\n"
assert t.count(old_enum) == 1, "enum anchor"
t = t.replace(old_enum, new_enum, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("schema: extractedText nullable + two lifecycle events")
