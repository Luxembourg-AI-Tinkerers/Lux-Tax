/**
 * Filing-package evidence index (API-7).
 *
 * A filing package is the set of values the taxpayer transcribes into the official
 * return, and its SHA-256 is the only proof of *what* was generated. The original
 * implementation upserted the package and overwrote `packageSha256` on every
 * regeneration, so the hash of the version actually filed was lost.
 *
 * This module keeps an append-only history instead, and refuses to touch a package
 * once the return has been filed.
 */

export interface PackageEvidenceEntry {
  /** SHA-256 of the generated payload. */
  sha256: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** ISO timestamp at which a later generation replaced this one. */
  supersededAt?: string;
}

export class FilingPackageImmutableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilingPackageImmutableError';
  }
}

/** Upper bound on retained generations, so the JSON cannot grow without limit. */
export const MAX_EVIDENCE_ENTRIES = 50;

/**
 * Appends a generation to the evidence index.
 *
 * The previous entry is marked superseded at the new generation time, so the index
 * reads as a chain: exactly one entry without `supersededAt` is the current package.
 * Entries are never removed except by the oldest-first cap.
 */
export function appendPackageEvidence(
  history: readonly PackageEvidenceEntry[] | null | undefined,
  entry: { sha256: string; generatedAt: string },
): PackageEvidenceEntry[] {
  const previous = (history ?? []).filter(
    (item): item is PackageEvidenceEntry => Boolean(item && typeof item.sha256 === 'string'),
  );

  const closed = previous.map((item, index) =>
    index === previous.length - 1 && !item.supersededAt
      ? { ...item, supersededAt: entry.generatedAt }
      : item,
  );

  const next = [...closed, { sha256: entry.sha256, generatedAt: entry.generatedAt }];
  return next.length > MAX_EVIDENCE_ENTRIES ? next.slice(next.length - MAX_EVIDENCE_ENTRIES) : next;
}

/** The generation currently in force, if any. */
export function currentPackageEvidence(
  history: readonly PackageEvidenceEntry[] | null | undefined,
): PackageEvidenceEntry | undefined {
  return (history ?? []).filter((item) => item && !item.supersededAt).pop();
}

/**
 * A package may only be regenerated while the return has not been filed. Once a
 * filing record exists, the values were copied into a real return and the package
 * becomes evidence.
 */
export function assertPackageRegenerationAllowed(hasFilingRecord: boolean): void {
  if (hasFilingRecord) {
    throw new FilingPackageImmutableError(
      'This return has been filed. The filing package is kept unchanged as evidence; ' +
        'to correct it, file an amendment (a new return version) instead of regenerating.',
    );
  }
}

/** Integrity check used when reading a package back. */
export function verifyPackageEvidence(
  entry: PackageEvidenceEntry | undefined,
  expectedSha256: string,
): boolean {
  if (!entry) return false;
  return entry.sha256.toLowerCase() === expectedSha256.toLowerCase();
}
