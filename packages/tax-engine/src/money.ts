/**
 * Fixed-point money helpers.
 *
 * All monetary arithmetic in the engine is performed on integer cents; values
 * are only converted back to `number` at the DTO boundary. This removes binary
 * floating-point drift from bracket, cap and credit computations (for example
 * 3 × 0.1 or repeated 0.07 surcharges).
 */

export const toCents = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
};

export const fromCents = (cents: number): number => Math.round(cents) / 100;

/** Multiply a cent amount by a rate, rounding half-up to the cent. */
export const mulRate = (cents: number, rate: number): number => {
  if (!Number.isFinite(cents) || !Number.isFinite(rate)) return 0;
  return Math.round(cents * rate);
};

/**
 * Exact addition of two money amounts: both are snapped to cents first, so a
 * long accumulation cannot drift (0.1 + 0.2 + ... stays at 2 decimals).
 */
export const addMoney = (a: number, b: number): number => fromCents(toCents(a) + toCents(b));

export const sumMoney = (...amounts: number[]): number =>
  fromCents(sumCents(...amounts.map((a) => toCents(a))));

export const sumCents = (...amounts: number[]): number =>
  amounts.reduce((total, amount) => total + (Number.isFinite(amount) ? Math.round(amount) : 0), 0);

export const minCents = (...amounts: number[]): number => Math.min(...amounts);
export const maxCents = (...amounts: number[]): number => Math.max(...amounts);

/** Floor a cent amount to whole euros (Art. 124 uses the cote in euros). */
export const floorToEuroCents = (cents: number): number => Math.floor(cents / 100) * 100;
