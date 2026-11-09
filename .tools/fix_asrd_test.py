import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """    // 6 000 × (1 + 8 % × 10) = 10 800 → the whole 10 000 is deductible
    close(result.deductions.total - result.deductions.art111, result.deductions.total - result.deductions.art111);
    assert.ok(result.deductions.specialExpensesTotal >= 10_000);"""
new = """    // 6 000 × (1 + 8 % × 10) = 10 800 → the whole 10 000 is deductible
    close(result.deductions.asrd, 10_000);
    assert.ok(result.deductions.specialExpensesTotal >= 10_000);"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
