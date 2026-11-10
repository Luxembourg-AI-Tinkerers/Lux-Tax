/**
 * Form 100F — official page / sheet / case numbers for the 2025 return.
 *
 * The official return (`100f-2025.pdf`, 20 pages) identifies every amount by a
 * page, a letter-coded sheet (S, P, CM, L, DS, CE, RD, Recap, Enfants, C/A)
 * and a case number printed on that page. The filing service used to emit a
 * sheet letter only; this map is the machine-readable counterpart of the paper
 * form, so a generated package can name the case the taxpayer has to fill in.
 *
 * Dependency-free on purpose: it is a constant, not a calculation. Every case
 * number below was checked against the text extracted from `100f-2025.pdf`.
 * Case numbers are data — never infer one, add it here first.
 *
 * Sections A (C/A), S, P, CM and L print two columns: taxpayer and spouse
 * ("contribuable" / "contribuable conjoint ou partenaire"). The `…Spouse`
 * entries are the spouse column of the same line, so a fact owned by the
 * co-filer lands on the right side of the sheet.
 *
 * `FORM100_CASES` holds copyable, real cases only: every case number is a
 * three- or four-digit number printed on the form. Items that are not a case
 * to copy — computed credits, and instructions that point at a procedure such
 * as the foreign tax credit — live in `RECAP` / `FORM100_INSTRUCTIONS` below
 * and carry a `kind` of `COMPUTED` or `INSTRUCTION`.
 */
export interface Form100CaseRef {
  page: number;
  sheet: string;
  caseNumber: string;
}

export const FORM100_CASES = {
  salaryGross: { page: 7, sheet: 'S', caseNumber: '701' },
  salaryGrossSpouse: { page: 7, sheet: 'S', caseNumber: '702' },
  socialSecurity: { page: 16, sheet: 'DS', caseNumber: '1601' },
  socialSecuritySpouse: { page: 16, sheet: 'DS', caseNumber: '1602' },
  withholdingSalary: { page: 19, sheet: 'RD', caseNumber: '1901' },
  withholdingSalarySpouse: { page: 19, sheet: 'RD', caseNumber: '1902' },
  pension: { page: 8, sheet: 'P', caseNumber: '801' },
  pensionSpouse: { page: 8, sheet: 'P', caseNumber: '802' },
  pensionWithholding: { page: 19, sheet: 'RD', caseNumber: '1903' },
  pensionWithholdingSpouse: { page: 19, sheet: 'RD', caseNumber: '1904' },
  capital: { page: 9, sheet: 'CM', caseNumber: '901' },
  capitalSpouse: { page: 9, sheet: 'CM', caseNumber: '902' },
  rental: { page: 10, sheet: 'L', caseNumber: '1001' },
  rentalSpouse: { page: 10, sheet: 'L', caseNumber: '1002' },
  freelance: { page: 5, sheet: 'C/A', caseNumber: '501' },
  freelanceSpouse: { page: 5, sheet: 'C/A', caseNumber: '502' },
  mortgageInterest: { page: 10, sheet: 'L', caseNumber: '1033' },
  art111: { page: 14, sheet: 'DS', caseNumber: '1471' },
  art111bis: { page: 15, sheet: 'DS', caseNumber: '1503' },
  savingsHousing: { page: 15, sheet: 'DS', caseNumber: '1525' },
  lrcp: { page: 16, sheet: 'DS', caseNumber: '1609' },
  donations: { page: 16, sheet: 'DS', caseNumber: '1611' },
  childcare: { page: 17, sheet: 'CE', caseNumber: '1715' },
  ffo: { page: 7, sheet: 'S', caseNumber: '730' },
  travel: { page: 7, sheet: 'S', caseNumber: '742' },
  specialExpensesForfait: { page: 15, sheet: 'DS', caseNumber: '1553' },
  aep: { page: 20, sheet: 'Recap', caseNumber: '0621' },
  cim: { page: 2, sheet: 'Enfants', caseNumber: '228' },
} as const;

export type Form100CaseKey = keyof typeof FORM100_CASES;

/**
 * Recap page: the sheet where the ACD re-derives amounts that have no case of
 * their own. Used for the computed credits and the loss instruction.
 */
export const RECAP = { page: 20, sheet: 'Recap', caseNumber: 'computed' } as const;

/**
 * Pointers that are not a Form 100 case to fill in.
 *
 * `foreignCredit`: the 100F has no foreign-income sheet. Treaty-exempt foreign
 * income goes in the "revenus exonérés" column of the category sheet that
 * matches its nature (S / P / CM / L) and the credit is claimed on RD page 19,
 * cases 1081/1082. Emitting case 1101 here would be the substantial-
 * participation capital-gains line, so the package emits an instruction
 * instead of a box.
 *
 * `lossCarryForward`: a negative freelance net profit is written as 0, not as
 * a negative case amount; the loss is carried forward under LIR Art. 114.
 */
/**
 * Which Form 100 sheet carries treaty-exempt foreign income of a given nature.
 *
 * The 100F has no foreign-income sheet: exempt foreign income is declared in the
 * "revenus exonérés" column of the category sheet matching its nature, and the
 * credit is claimed on RD 1081/1082. The nature travels on the fact's field key
 * because the app has no per-fact foreign nature field — but a wrong sheet is
 * worse than no sheet, so an unknown key returns `null` and the caller falls
 * back to the generic "S/P/CM/L" sentence.
 *
 * S = salary / employment income, P = pension, CM = capital (movable),
 * L = rental (immovable).
 */
const FOREIGN_NATURE_SHEETS: Record<
  string,
  { sheet: string; page: number; label: string }
> = {
  foreignSalary: { sheet: 'S', page: 9, label: 'salary / employment income' },
  foreignPension: { sheet: 'P', page: 11, label: 'pension' },
  foreignCapital: { sheet: 'CM', page: 12, label: 'capital (movable) income' },
  foreignRental: { sheet: 'L', page: 13, label: 'rental (immovable) income' },
};

export function foreignNatureSheet(
  fieldKey: string | null | undefined,
): { sheet: string; page: number; label: string } | null {
  if (!fieldKey) return null;
  return FOREIGN_NATURE_SHEETS[fieldKey] ?? null;
}

/**
 * The exempt-income pointer for a known foreign nature: the sheet where the
 * income belongs, while the credit itself stays on RD 1081/1082.
 *
 * Kept outside `FORM100_INSTRUCTIONS` so that map stays pure data — an existing
 * test asserts every entry there carries `kind: 'INSTRUCTION'`, and a function
 * member would break that invariant for no benefit.
 */
export function foreignSheetPointer(
  nature: { sheet: string; page: number },
): { page: number; sheet: string; caseNumber: string; kind: 'INSTRUCTION' } {
  return {
    page: nature.page,
    sheet: nature.sheet,
    caseNumber: 'exempt income column',
    kind: 'INSTRUCTION',
  };
}

export const FORM100_INSTRUCTIONS = {
  /**
   * Art. 91 liberal profession: page 6, sheet I. The sheet has several sections
   * (601–651, 6108–6110) depending on whether the profit is established by a
   * balance sheet or by a receipts/expenses comparison, so no single case is
   * asserted here — the package points at the sheet instead.
   */
  professionalProfit: {
    page: 6,
    sheet: 'I',
    caseNumber: '601–651 / 6108–6110',
    kind: 'INSTRUCTION',
  },
  /**
   * DS 1553 is the total of the special expenses covered by the minimum forfait
   * (cases 1301–1552), not the forfait itself. When the legal minimum is higher
   * than the covered total, the minimum substitutes; this row says so.
   */
  specialExpensesMinimum: {
    page: 15,
    sheet: 'DS',
    caseNumber: '1553',
    kind: 'INSTRUCTION',
  },
  /**
   * A stored calculation written before `deductions` existed carries no DS
   * breakdown, so case 1553 cannot be rebuilt. Point at a recalculation instead
   * of printing a zero that looks like a declared figure.
   */
  staleSnapshot: {
    page: 15,
    sheet: 'DS',
    caseNumber: '1553',
    kind: 'INSTRUCTION',
  },
  foreignCredit: {
    page: 19,
    sheet: 'RD',
    caseNumber: '1081/1082',
    kind: 'INSTRUCTION',
  },
  lossCarryForward: {
    page: 20,
    sheet: 'Recap',
    caseNumber: 'computed',
    kind: 'INSTRUCTION',
  },
} as const;
