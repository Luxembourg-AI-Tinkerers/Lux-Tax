import { FactCategory } from '@luxtax/contracts';

export interface FactIdentity {
  readonly category: FactCategory;
  readonly fieldKey: string;
}

/** Two facts collide when they feed the same return line: category + field box. */
export function factKey(fact: FactIdentity): string {
  return `${fact.category}::${fact.fieldKey}`;
}

/** The already-recorded fact for that category + field key, if any. */
export function findFact<TExisting extends FactIdentity>(
  existing: readonly TExisting[],
  candidate: FactIdentity,
): TExisting | undefined {
  const key = factKey(candidate);
  return existing.find((fact) => factKey(fact) === key);
}

/**
 * Splits candidates into the ones that have no confirmed fact yet and the ones
 * already recorded. Re-running a "load demo facts" action must not add a second
 * copy of a figure the engine would then sum twice.
 */
export function splitNewFacts<TCandidate extends FactIdentity, TExisting extends FactIdentity>(
  candidates: readonly TCandidate[],
  existing: readonly TExisting[],
): { missing: TCandidate[]; present: TCandidate[] } {
  const known = new Set(existing.map(factKey));
  const missing: TCandidate[] = [];
  const present: TCandidate[] = [];
  for (const candidate of candidates) {
    (known.has(factKey(candidate)) ? present : missing).push(candidate);
  }
  return { missing, present };
}
