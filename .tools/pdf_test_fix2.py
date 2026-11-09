import io
p = "apps/api/test/annex-pdf.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""        code: '104',
        title: 'Test (parent)',""", """        code: 'CUSTOM',
        title: 'Test (parent)',""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
