import io

p = "packages/tax-engine/test/invariants.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")

old = """  it('is reproducible: the same input yields the same output', () => {
    const scenario = salaryScenario(73_421.37, [
      { id: 'f1', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 3_200 },
    ]);
    const first = LuxembourgTaxEngine.calculate(scenario);
    const second = LuxembourgTaxEngine.calculate(scenario);
    assert.deepEqual(second, first);
  });"""

new = """  it('is reproducible: the same input yields the same figures', () => {
    // `calculatedAt` is a wall-clock stamp, so the comparison excludes it: what must be
    // deterministic is the arithmetic, not the time of day.
    const { calculatedAt: _a, ...first } = LuxembourgTaxEngine.calculate(
      salaryScenario(73_421.37, [
        { id: 'f1', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 3_200 },
      ]),
    ) as unknown as Record<string, unknown>;
    const { calculatedAt: _b, ...second } = LuxembourgTaxEngine.calculate(
      salaryScenario(73_421.37, [
        { id: 'f1', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 3_200 },
      ]),
    ) as unknown as Record<string, unknown>;
    assert.deepEqual(second, first);
  });"""

assert s.count(old) == 1
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
