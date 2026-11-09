/**
 * Calculation history helpers (API-9).
 *
 * `TaxYearWorkspace.calculationResult` holds only the latest result, so a
 * recalculation silently replaced the previous one: the path from a draft to the
 * filed figure could not be audited. Every calculation now also writes an
 * append-only `CalculationSnapshot`.
 *
 * The hash must be stable across runs and across key ordering, otherwise two
 * identical results would look different. `canonicalJson` sorts object keys
 * recursively before hashing.
 */
import { createHash } from 'node:crypto';

/** Deterministic JSON: object keys sorted at every depth, arrays kept in order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortValue(source[key]);
    }
    return sorted;
  }
  return value;
}

/** SHA-256 of the canonical form — the snapshot's integrity anchor. */
export function hashCalculationResult(result: unknown): string {
  return createHash('sha256').update(canonicalJson(result)).digest('hex');
}

export interface CalculationSnapshotSummary {
  taxYear: number;
  taxClass: string;
  rulePackageVersion: string;
  taxableIncome: number;
  finalTaxLiability: number;
  balancePayableOrRefund: number;
  generatedAt: string | null;
}

/**
 * The fields worth showing in a history list. Tolerant of a partial result so a
 * historical row cannot break the endpoint.
 */
export function summariseCalculation(result: unknown): {
  taxableIncome: number;
  finalTaxLiability: number;
  balancePayableOrRefund: number;
  generatedAt: string | null;
} {
  const source = (result ?? {}) as Record<string, unknown>;
  const number = (key: string): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const generatedAt = source.calculatedAt;

  return {
    taxableIncome: number('taxableIncome'),
    finalTaxLiability: number('finalTaxLiability'),
    balancePayableOrRefund: number('balancePayableOrRefund'),
    generatedAt: typeof generatedAt === 'string' ? generatedAt : null,
  };
}

/** True when two results are byte-identical after canonicalisation. */
export function isSameCalculation(a: unknown, b: unknown): boolean {
  return hashCalculationResult(a) === hashCalculationResult(b);
}
