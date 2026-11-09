import io
p = "apps/mobile/test/file-export.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """    assert.strictEqual(sanitizeFileName('x.e xe'), 'x.e xe');"""
new = """    // the extension is reduced to alphanumerics, so a space disappears
    assert.strictEqual(sanitizeFileName('x.e xe'), 'x.exe');"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
