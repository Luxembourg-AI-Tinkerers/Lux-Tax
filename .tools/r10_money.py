import io
p = "packages/tax-engine/src/money.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export const sumCents = (...amounts: number[]): number =>""",
"""/**
 * Exact addition of two money amounts: both are snapped to cents first, so a
 * long accumulation cannot drift (0.1 + 0.2 + ... stays at 2 decimals).
 */
export const addMoney = (a: number, b: number): number => fromCents(toCents(a) + toCents(b));

export const sumMoney = (...amounts: number[]): number =>
  fromCents(sumCents(...amounts.map((a) => toCents(a))));

export const sumCents = (...amounts: number[]): number =>""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
