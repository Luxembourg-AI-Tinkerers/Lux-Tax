import io
p = "apps/mobile/src/lib/file-export.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old = """export function sanitizeFileName(input: string, fallback = 'document'): string {
  const raw = (input ?? '').normalize('NFC');"""
new = """export function sanitizeFileName(input: string, fallback = 'document'): string {
  // Take the basename first: `../../etc/passwd` is not a name, it is a path, and the
  // only safe reading of it is "passwd". Doing this before extension detection also
  // stops `dir/file.tar.gz` from being mistaken for a `gz` extension of a weird stem.
  const source = (input ?? '').normalize('NFC');
  const segments = source.split(/[\\\\/]+/).filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  const raw = segments.length > 0 ? segments[segments.length - 1] : '';"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("impl ok")

p2 = "apps/mobile/test/file-export.spec.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""    assert.strictEqual(sanitizeFileName('../../etc/passwd'), '.._.._etc_passwd');
    assert.strictEqual(sanitizeFileName('dir/sub/file.pdf'), 'dir_sub_file.pdf');
    assert.strictEqual(sanitizeFileName('C:\\\\Windows\\\\system32\\\\x.pdf'), 'C__Windows_system32_x.pdf');""",
"""    // a path is reduced to its basename before anything else
    assert.strictEqual(sanitizeFileName('../../etc/passwd'), 'passwd');
    assert.strictEqual(sanitizeFileName('dir/sub/file.pdf'), 'file.pdf');
    assert.strictEqual(sanitizeFileName('C:\\\\Windows\\\\system32\\\\x.pdf'), 'x.pdf');
    assert.ok(!sanitizeFileName('../../etc/passwd').includes('/'));
    assert.ok(!sanitizeFileName('../../etc/passwd').includes('..'));""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("test ok")
