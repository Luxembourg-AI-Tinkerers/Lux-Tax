import type { ChildReliefHistoryEntry } from '@luxtax/contracts';

export interface ChildReliefResolution {
  /** Children that still generate the Art. 122 modération this year. */
  moderationCount: number;
  /** Of those, the ones with no family allowance / CEDIES / SNJ (dégrèvement). */
  degrevementChildren: number;
  /** Children that generate the Art. 123bis bonification this year. */
  bonificationChildren: number;
  warnings: string[];
}

/**
 * Resolve the per-child Art. 122 / 123bis history.
 *
 * The scalar counts cannot express the two lifetime rules of Art. 123bis:
 * a child generates at most **two** bonifications, and a child cannot generate
 * a dégrèvement and a bonification in the same year. Nor can they express the
 * transitional résidence-alternée rule (Art. 123bis al. 1a), which applies to
 * assessment years 2025 and 2026 only and requires alternating residence, joint
 * parental authority and a family allowance received by this household.
 *
 * The function is pure and total: malformed or incomplete entries are excluded
 * with an explicit warning, never silently granted or silently dropped.
 */
export function resolveChildReliefHistory(
  entries: readonly ChildReliefHistoryEntry[],
  taxYear: number,
): ChildReliefResolution {
  let moderationCount = 0;
  let degrevementChildren = 0;
  let bonificationChildren = 0;
  const warnings: string[] = [];

  entries.forEach((entry, index) => {
    const label = entry.childId?.trim() || `child ${index + 1}`;
    const moderation = entry.moderationThisYear === true;

    if (moderation) {
      moderationCount += 1;
      // The dégrèvement is the fallback when none of the three moderation forms
      // (family allowance, CEDIES, SNJ) was paid for this child.
      if (entry.benefitReceived !== true) degrevementChildren += 1;

      if (entry.moderationEndYear !== undefined && entry.moderationEndYear <= taxYear - 1) {
        warnings.push(
          `Art. 122: ${label} still generates a modération in ${taxYear} but its moderation end year ` +
            `(${entry.moderationEndYear}) is in the past. A child cannot generate both a dégrèvement and a ` +
            `bonification in the same year, so no bonification is granted for this child.`,
        );
      }
      return;
    }

    if (entry.moderationEndYear === undefined) {
      warnings.push(
        `Art. 123bis: ${label} has no moderation end year, so the two-year window cannot be checked and ` +
          `no bonification is granted.`,
      );
      return;
    }
    if (entry.moderationEndYear > taxYear - 1) {
      warnings.push(
        `Art. 123bis: ${label}'s moderation ends in ${entry.moderationEndYear}; the bonification is granted ` +
          `only once the moderation right has expired, i.e. from ${entry.moderationEndYear + 1}.`,
      );
      return;
    }
    if (entry.moderationEndYear < taxYear - 2) {
      // Expired more than two years before the tax year: outside Art. 123bis al. 1.
      return;
    }

    const granted = Math.max(0, Math.floor(entry.bonificationsGranted ?? 0));
    if (granted >= 2) {
      warnings.push(
        `Art. 123bis: ${label} has already generated ${granted} bonifications. The lifetime maximum is two ` +
          `per child, so none is granted for ${taxYear}.`,
      );
      return;
    }

    if (entry.inHousehold === false) {
      const transitionalYear = taxYear === 2025 || taxYear === 2026;
      const alternates =
        entry.residenceAlternee === true &&
        entry.jointParentalAuthority === true &&
        entry.familyAllowanceReceived === true;
      if (!transitionalYear || !alternates) {
        warnings.push(
          `Art. 123bis al. 1a: ${label} is outside the household. The transitional résidence-alternée rule ` +
            `applies only to assessment years 2025 and 2026 and requires alternating residence, joint parental ` +
            `authority and a family allowance received by this household; no bonification is granted.`,
        );
        return;
      }
    }

    bonificationChildren += 1;
  });

  return { moderationCount, degrevementChildren, bonificationChildren, warnings };
}
