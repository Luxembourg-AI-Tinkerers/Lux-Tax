import io
p = "apps/mobile/test/app-lock.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """    assert.strictEqual(lockoutForFailures(9), 1_920_000 > DEFAULT_LOCK_POLICY.maxLockoutMs ? 900_000 : 0);"""
new = """    assert.strictEqual(lockoutForFailures(9), DEFAULT_LOCK_POLICY.maxLockoutMs);"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
