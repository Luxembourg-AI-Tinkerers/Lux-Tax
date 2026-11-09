/**
 * Assessment deadline arithmetic.
 *
 * Pure functions only — no Nest, no Prisma — so the rules that decide an
 * objection deadline can be verified without a database. Every date is handled
 * in UTC: an assessment or bulletin date is a calendar day, not an instant.
 */

/** Calendar day in UTC, clock set to midnight. */
function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Adds whole months in UTC, clamping to the last day of the target month:
 * 31 January + 1 month is 28 (or 29) February, never 3 March.
 *
 * The time of day of `date` is preserved, so a midnight input gives a midnight
 * result.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const targetMonthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth(),
      Math.min(date.getUTCDate(), lastDayOfTargetMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Default dates derived from the date printed on the ACD notice:
 * - objection deadline: three months after the notice;
 * - internal follow-up: 30 days after the notice.
 *
 * These are product defaults, not a legal citation: both values are written onto
 * the assessment row at import and can be overridden per assessment, so changing
 * the rule later never rewrites a stored deadline.
 */
export function defaultAssessmentFollowUp(bulletinDate: Date): {
  objectionDeadline: Date;
  followUpAt: Date;
} {
  const noticeDay = startOfUtcDay(bulletinDate);
  return {
    objectionDeadline: addMonthsUtc(noticeDay, 3),
    followUpAt: addDaysUtc(noticeDay, 30),
  };
}

/**
 * True while an objection can still be lodged. The deadline day itself counts
 * (end of day UTC). A missing deadline is not open: an assessment imported
 * before the field existed must not invent a window.
 */
export function isObjectionOpen(
  deadline: Date | null | undefined,
  now: Date,
): boolean {
  if (!deadline) return false;
  const endOfDeadlineDay = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return now.getTime() <= endOfDeadlineDay;
}
