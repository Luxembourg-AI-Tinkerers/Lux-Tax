/**
 * A return version stores the facts it was built from (`factsSnapshotJson`).
 *
 * A snapshot written before the return predicate also required
 * `isSharedWithHousehold` may still contain a fact its owner kept to themselves.
 * GET /return-version is readable by every household member, so such an entry is
 * dropped when the snapshot is served instead of leaking it; snapshots written
 * by the current predicate never contain one. Rows without the flag (an older
 * snapshot shape) are kept as they are.
 */
export function stripUnsharedSnapshotFacts(snapshot: unknown): unknown {
  if (!Array.isArray(snapshot)) {
    return snapshot;
  }

  return snapshot.filter((fact) => {
    if (typeof fact !== 'object' || fact === null) {
      return true;
    }

    return (fact as { isSharedWithHousehold?: unknown }).isSharedWithHousehold !== false;
  });
}
