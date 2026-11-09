import io
p = "apps/api/prisma/schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  form100BoxesJson   Json          @default("[]")
  myGuichetGuideJson Json          @default("[]")"""
new = """  form100BoxesJson   Json          @default("[]")
  annexesJson        Json          @default("[]")
  myGuichetGuideJson Json          @default("[]")"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
