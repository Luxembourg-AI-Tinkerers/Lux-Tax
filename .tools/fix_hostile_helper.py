import io

p = "packages/tax-engine/test/hostile-input.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")

old_helper = """const figureKeys = [
  'grossIncome',
  'netIncome',
  'taxableIncome',
  'totalDeductions',
  'baseTax',
  'totalTaxCredits',
  'finalTaxLiability',
  'balancePayableOrRefund',
  'effectiveTaxRate',
] as const;

function assertSane(result: Record<string, unknown>, label: string): void {
  for (const key of figureKeys) {
    const value = result[key] as number;
    assert.ok(
      Number.isFinite(value),
      `${label}: ${key} is not finite (${String(value)})`,
    );
    assert.ok(value >= 0, `${label}: ${key} is negative (${value})`);
  }
}"""

new_helper = """/** Every figure must be a finite number, whatever the input looked like. */
const alwaysFinite = [
  'grossIncome',
  'netIncome',
  'taxableIncome',
  'totalDeductions',
  'baseTax',
  'totalTaxCredits',
  'finalTaxLiability',
  'balancePayableOrRefund',
  'effectiveTaxRate',
] as const;

/**
 * Figures that cannot be negative by construction.
 *
 * Deliberately excluded:
 *  - `netIncome` may be negative in a loss year (rental or business losses exceed income); the
 *    taxable base is floored at zero later, so a negative net income is information, not an error.
 *  - `balancePayableOrRefund` is signed: positive = payable, negative = refund.
 */
const neverNegative = [
  'grossIncome',
  'taxableIncome',
  'totalDeductions',
  'baseTax',
  'totalTaxCredits',
  'finalTaxLiability',
] as const;

function assertSane(result: Record<string, unknown>, label: string): void {
  for (const key of alwaysFinite) {
    const value = result[key] as number;
    assert.ok(
      Number.isFinite(value),
      `${label}: ${key} is not finite (${String(value)})`,
    );
  }
  for (const key of neverNegative) {
    const value = result[key] as number;
    assert.ok(value >= 0, `${label}: ${key} is negative (${value})`);
  }
}"""

assert s.count(old_helper) == 1
s = s.replace(old_helper, new_helper, 1)

# The per-case assertions on grossIncome stay valid; netIncome may be negative now, so the
# "as no income" case still expects 0 and that is fine.
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
