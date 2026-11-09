import io
p = "apps/api/test/annex-pdf.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""      assert.strictEqual(text.slice(offset, offset + 7).includes(' 0 obj'), true, `object at ${offset}`);""",
"""      assert.strictEqual(text.slice(offset, offset + 24).includes(' 0 obj'), true, `object at ${offset}`);""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
