import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
anchor = """  test('CIP and CII floors', () => {"""
block = """  test('CISSM: EUR 70/month on 1 800–3 000, phased out by 3 600', () => {
    close(cissmForSalary(12 * 2_000, pkg2025), 840);
    close(cissmForSalary(12 * 3_300, pkg2025), 70 * 12 * (300 / 600));
    close(cissmForSalary(12 * 1_500, pkg2025), 0);
    close(cissmForSalary(12 * 4_000, pkg2025), 0);
  });

  test('CIP and CII floors', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
s = s.replace("""  cimFor,
  cipForPension,""", """  cimFor,
  cipForPension,
  cissmForSalary,""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
