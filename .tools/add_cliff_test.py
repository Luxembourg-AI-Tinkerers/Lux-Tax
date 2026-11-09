import io

p = "packages/tax-engine/test/invariants.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")

marker = "    it(`${taxYear}: Class 2 splitting never costs more than Class 1`, () => {"
assert s.count(marker) == 1

new_test = """    it(`${taxYear}: no bracket cliff — +50 EUR of income cannot raise the tax by more`, () => {
      // A progressive tariff is continuous: crossing a bracket boundary changes the marginal
      // rate, not the amount already taxed. A jump above the top statutory rate would mean the
      // brackets overlap or a boundary is off by one.
      const topRate = 0.42;
      for (const cls of CLASSES) {
        for (let income = 0; income <= 300_000; income += 50) {
          const delta = baseTax(income + 50, cls, pkg) - baseTax(income, cls, pkg);
          assert.ok(
            delta <= 50 * topRate + 1e-6,
            `${cls}: +50 EUR at ${income} raised the tax by ${delta.toFixed(2)}`,
          );
        }
      }
    });

""" + marker

s = s.replace(marker, new_test, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
