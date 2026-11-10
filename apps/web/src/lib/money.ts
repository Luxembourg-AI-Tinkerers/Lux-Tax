/**
 * The single euro formatter for the web client: every money figure on screen
 * goes through it, so a balance reads the same way in the dashboard, the tax
 * engine, the filing package and the facts list.
 *
 * A missing amount must never look like a zero: `null`, `undefined`, an empty
 * string and a non-numeric value all render as an em dash.
 */
const EURO_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rendered in place of an amount that is absent or not a number. */
export const NO_AMOUNT = '—';

export function formatEuro(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return NO_AMOUNT;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? EURO_FORMAT.format(amount) : NO_AMOUNT;
}
