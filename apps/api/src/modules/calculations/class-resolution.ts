import { HouseholdRole, TaxClass } from '@luxtax/contracts';

/**
 * Questionnaire inputs the class and single-parent derivation read.
 *
 * Deliberately structural (no DTO import) so this module stays free of Nest,
 * Prisma and any runtime dependency: `Partial<QuestionnaireAnswersDto>` is
 * assignable to it.
 */
export interface ClassResolutionAnswers {
  assessmentMode?: string;
  childrenWithModeration?: number;
  childrenCount?: number;
  primaryAge?: number;
  /** Art. 119 n° 3 b — year the marriage ended by death. */
  spouseDeathYear?: number;
  /** Art. 119 n° 3 c — year of the divorce or legal/factual separation. */
  divorceOrSeparationYear?: number;
  /** Art. 119 n° 3 c — Class 2 for the five years before the divorce/separation. */
  class2BeforeEvent?: boolean;
}

/** Marital statuses that can claim the Art. 154ter CIM as a single parent. */
const SINGLE_PARENT_STATUSES = ['SINGLE', 'DIVORCED', 'WIDOWED'];

/** Art. 119 n° 3 b–c window could not be checked: the default class was applied. */
const WINDOW_UNCHECKED_WARNING =
  'The three-year Class 2 window (Art. 119 n° 3) cannot be checked because the year of death/divorce is missing; the default class is applied.';

/**
 * Art. 119 n° 3 b–c: the widow(er) / divorced filer keeps Class 2 for the year of
 * the event and the three following years, i.e. `taxYear - eventYear` in [0, 3].
 * A missing or future event year is outside the window.
 */
function isInClass2Window(taxYear: number, eventYear: number | undefined): boolean {
  if (eventYear === undefined) return false;
  const elapsed = taxYear - eventYear;
  return elapsed >= 0 && elapsed <= 3;
}

/**
 * Art. 119 n° 3 b–c: warns when the three-year Class 2 window cannot be checked
 * because the questionnaire has no event year. Silence would make the Class 1a /
 * Class 1 default look like a settled legal answer.
 */
export function classWindowWarning(
  maritalStatus: string | undefined,
  answers: ClassResolutionAnswers,
): string | null {
  if (maritalStatus === 'WIDOWED' && answers.spouseDeathYear === undefined) {
    return WINDOW_UNCHECKED_WARNING;
  }
  if (maritalStatus === 'DIVORCED' && answers.divorceOrSeparationYear === undefined) {
    return WINDOW_UNCHECKED_WARNING;
  }
  return null;
}

/**
 * Art. 154ter: a single, divorced or widowed parent with a moderated child is a
 * single parent. An explicit questionnaire answer (including `false`) wins.
 */
export function deriveIsSingleParent(
  maritalStatus: string | undefined,
  childrenWithModeration: number,
  explicit: boolean | undefined,
): boolean {
  if (explicit !== undefined) return explicit;
  return SINGLE_PARENT_STATUSES.includes(maritalStatus ?? '') && childrenWithModeration > 0;
}

/**
 * Art. 119 / 3 / 3bis / 3ter class assignment.
 *
 * The family situation drives the default; a class supplied by the caller
 * overrides it (the user may have received a different class on their fiche de
 * retenue).
 *
 * `childrenWithModeration` is passed in already resolved (questionnaire answer,
 * `childrenCount`, or the household dependants) so the class and the CIM gate
 * cannot disagree on whether a moderated child exists.
 */
export function deriveTaxClass(
  workspaceTaxClass: TaxClass | null,
  maritalStatus: string | undefined,
  answers: ClassResolutionAnswers,
  childrenWithModeration: number,
  taxYear: number,
): TaxClass {
  if (workspaceTaxClass) return workspaceTaxClass;

  const age65 = (answers.primaryAge ?? 0) >= 65;

  switch (maritalStatus) {
    case 'MARRIED':
      // Art. 3: collective taxation is the default; only an explicit Art. 3ter
      // election moves the household out of Class 2.
      return TaxClass.CLASS_2;
    case 'PACS':
      // Art. 3bis: partners are separate by default; Class 2 only on a joint
      // request, which the questionnaire records as a collective assessment mode.
      if (answers.assessmentMode && answers.assessmentMode !== 'COLLECTIVE') return TaxClass.CLASS_1;
      if (answers.assessmentMode === 'COLLECTIVE') return TaxClass.CLASS_2;
      return childrenWithModeration > 0 || age65 ? TaxClass.CLASS_1A : TaxClass.CLASS_1;
    case 'WIDOWED':
      // Art. 119 n° 3 b: Class 2 for the death year and the three following years.
      if (isInClass2Window(taxYear, answers.spouseDeathYear)) return TaxClass.CLASS_2;
      return TaxClass.CLASS_1A;
    case 'DIVORCED':
      // Art. 119 n° 3 c: Class 2 only while the window is open *and* the filer had
      // five years of Class 2 before the divorce/separation; otherwise the ordinary
      // children / age test decides between Class 1a and Class 1.
      if (
        answers.class2BeforeEvent === true &&
        isInClass2Window(taxYear, answers.divorceOrSeparationYear)
      ) {
        return TaxClass.CLASS_2;
      }
      return childrenWithModeration > 0 || age65 ? TaxClass.CLASS_1A : TaxClass.CLASS_1;
    case 'SINGLE':
    default:
      return childrenWithModeration > 0 || age65 ? TaxClass.CLASS_1A : TaxClass.CLASS_1;
  }
}

/** Structural member shape: a Prisma `HouseholdMembership` row is assignable as-is. */
export interface FilerMemberInput {
  userId: string;
  /**
   * `HouseholdRole` value. Typed as `string` so the Prisma enum
   * (`$Enums.HouseholdRole`) and plain literals both fit without a cast.
   */
  role: string;
}

/** The two ids the calculation splits the household on. */
export interface FilerMembers {
  primaryUserId: string | null;
  spouseUserId: string | null;
}

/** Roles that file the return. A VIEWER may read the household but never files. */
const FILER_ROLES: readonly string[] = [HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER];

/**
 * Art. 3 / 3bis: who files, and whether there is a spouse at all.
 *
 * A second ACTIVE membership is not automatically a spouse: the household role
 * decides. A VIEWER (or any non-filer membership) must never be selected as the
 * spouse, otherwise a spouse-less Class 2 filer keeps the couple's collective
 * extras (double capital tranche, couple deduction multiplier).
 *
 * - The acting user is the primary whenever that user is a PRIMARY_FILER or a
 *   CO_FILER: the calculation must be run on the filer's own side of the
 *   household. Without it, a co-filer who is the surviving or divorced spouse
 *   would compute on the deceased/former spouse's income as primary.
 * - Otherwise PRIMARY_FILER is the primary wherever it appears in the array,
 *   then the first filer.
 * - The spouse is the first CO_FILER that is not the primary; a lone CO_FILER
 *   therefore has no spouse. When the acting CO_FILER was promoted over the
 *   PRIMARY_FILER, that remaining primary is the other half of the couple and
 *   stays the spouse (dropping it would remove a married couple's collective
 *   extras on the co-filer's own calculation).
 * - No filer at all (VIEWER only) yields two nulls.
 *
 * The role says nothing about whether the marriage still exists; a membership
 * cannot be ended through the household API, so a deceased or former spouse
 * keeps an ACTIVE CO_FILER row. `spouseEndsAtEvent` is what ends the couple for
 * the calculation year.
 *
 * Pure and dependency-free so the selection can be tested without Prisma.
 */
export function selectFilerMembers(
  members: readonly FilerMemberInput[],
  actorUserId?: string,
): FilerMembers {
  const filerMembers = members.filter((member) => FILER_ROLES.includes(member.role));
  const actorMember =
    actorUserId === undefined
      ? undefined
      : filerMembers.find((member) => member.userId === actorUserId);
  const primaryMember =
    actorMember ??
    filerMembers.find((member) => member.role === HouseholdRole.PRIMARY_FILER) ??
    filerMembers[0] ??
    null;

  const actorPromotedFromCoFiler =
    primaryMember !== null &&
    primaryMember === actorMember &&
    primaryMember.role === HouseholdRole.CO_FILER;
  const otherFilers = filerMembers.filter(
    (member) => member.userId !== primaryMember?.userId,
  );
  // When the acting CO_FILER is promoted to the taxpayer column, the spouse is
  // the real PRIMARY_FILER — never another CO_FILER who happens to be first in
  // the list. Otherwise the primary filer's facts and the third filer's income
  // would be merged under the actor.
  const spouseMember =
    (actorPromotedFromCoFiler
      ? otherFilers.find((member) => member.role === HouseholdRole.PRIMARY_FILER)
      : undefined) ??
    otherFilers.find((member) => member.role === HouseholdRole.CO_FILER) ??
    null;

  return {
    primaryUserId: primaryMember?.userId ?? null,
    spouseUserId: spouseMember?.userId ?? null,
  };
}

/**
 * Art. 119 n° 3 b–c: whether the taxpayer still has a current spouse.
 *
 * WIDOWED and DIVORCED never has a current spouse for the calculation: the
 * marriage ended by death or dissolution, so the household's ACTIVE CO_FILER is
 * a former/deceased spouse (or a data artefact), never a spouse to assess
 * jointly with. That holds whether or not the questionnaire carries the event
 * year — a missing year is a data gap, not evidence of a surviving marriage.
 *
 * The event year only bounds the Art. 119 n° 3 three-year Class 2 window, which
 * `deriveTaxClass` / `classWindowWarning` handle. The year inputs stay in the
 * signature for that window and for call-site stability; this gate does not
 * read them.
 *
 * Pure so the service gate can be tested without Prisma.
 */
export function spouseEndsAtEvent(
  maritalStatus: string | undefined,
  _answers: ClassResolutionAnswers,
  _taxYear: number,
): boolean {
  return maritalStatus === 'WIDOWED' || maritalStatus === 'DIVORCED';
}

/**
 * LEG-8: only a married Class 2 couple has three legally distinct scenarios.
 *
 * A widow(er) or divorced filer keeping Class 2 under Art. 119 n° 3 has no
 * spouse to assess, so the two individual runs collapse onto the collective
 * tariff; a married filer without a joined CO_FILER has no second taxpayer to
 * split with; and a PACS couple may only reallocate its joint base (Art. 3ter),
 * never file as pure individuals. None of them may be reported as comparable.
 */
export function isScenarioComparisonEligible(
  maritalStatus: string | undefined,
  taxClass: TaxClass,
  hasAssessedSpouse: boolean,
): boolean {
  return maritalStatus === 'MARRIED' && taxClass === TaxClass.CLASS_2 && hasAssessedSpouse;
}

/**
 * `persist: false` marks a comparison run: it reads and validates the workspace
 * but writes neither the stored result nor a TAX_CALCULATED event, so a
 * comparison can never be mistaken for a filing election. Pure so the boundary
 * is testable without Prisma.
 */
export function shouldPersist(options?: { persist?: boolean }): boolean {
  return options?.persist !== false;
}
