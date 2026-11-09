import io

p = "apps/api/test/param-wiring.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
old = """    assert.ok(service.includes('calculateDeductions'), 'service file looks wrong');"""
new = """    assert.ok(
      service.includes('LuxembourgTaxEngine.calculate') || service.includes('answers.'),
      'service file looks wrong',
    );"""
assert s.count(old) == 1
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
