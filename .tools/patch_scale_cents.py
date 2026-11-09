import io
p = "packages/tax-engine/src/scale.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

s = s.replace("""import type { RulePackage, TaxBracket } from './rules/types';""",
"""import type { RulePackage, TaxBracket } from './rules/types';
import { fromCents, mulRate, toCents } from './money';""")

old = """  let total = 0;
  for (const bracket of scale) {
    if (taxableIncome <= bracket.lower) break;
    const slice = Math.min(taxableIncome, bracket.upper) - bracket.lower;
    if (slice > 0) total += slice * bracket.rate;
  }
  return total;
}"""
new = """  // Bracket slices and rates are combined in integer cents so that repeated
  // rate multiplications cannot drift (e.g. 0.39 on a long band).
  const incomeCents = toCents(taxableIncome);
  let totalCents = 0;

  for (const bracket of scale) {
    const lowerCents = toCents(bracket.lower);
    if (incomeCents <= lowerCents) break;
    const upperCents = Number.isFinite(bracket.upper) ? toCents(bracket.upper) : incomeCents;
    const sliceCents = Math.min(incomeCents, upperCents) - lowerCents;
    if (sliceCents > 0) totalCents += mulRate(sliceCents, bracket.rate);
  }

  return fromCents(totalCents);
}"""
assert s.count(old) == 1
s = s.replace(old, new)

old2 = """      result = Math.min(raw, anchorTax + cap.rate * (taxableIncome - cap.from));"""
new2 = """      result = Math.min(
        raw,
        anchorTax + fromCents(mulRate(toCents(taxableIncome - cap.from), cap.rate)),
      );"""
assert s.count(old2) == 1
s = s.replace(old2, new2)

old3 = """    const bandTax = anchorTax + cap.rate * (cap.to - cap.from);"""
new3 = """    const bandTax = anchorTax + fromCents(mulRate(toCents(cap.to - cap.from), cap.rate));"""
assert s.count(old3) == 1
s = s.replace(old3, new3)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
