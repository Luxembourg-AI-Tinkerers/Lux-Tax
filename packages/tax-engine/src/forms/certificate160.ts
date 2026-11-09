/**
 * Certificate 160 — the employer's salary / withholding certificate
 * (modèle 160F). Dependency-free on purpose: it is a lookup table, not a
 * calculation.
 *
 * The certificate does not use the engine's field keys. Its gross-pay section
 * is labelled with single letters and its deduction section with short
 * letter codes (modèle 160F 2025, notes 3 and 6):
 *
 *   S    = salaire                       (note 3)
 *   C    = cotisation de sécurité sociale complémentaire (note 3)
 *   R    = rappels d'années antérieures  (note 3, not a return fact here)
 *   P    = pension                       (note 3)
 *   FD   = frais de déplacement          (note 6, fiche de retenue)
 *   FO   = frais d'obtention             (note 6, fiche de retenue)
 *   FFO  = forfait pour frais d'obtention(note 6, fiche de retenue)
 *   DS   = dépenses spéciales            (note 6, fiche de retenue)
 *   FDS  = forfait pour dépenses spéciales (note 6, fiche de retenue)
 *   CE   = charges extraordinaires       (note 6, fiche de retenue)
 *   AC   = abattement conjoint           (note 6, fiche de retenue)
 *   LRCP = régime complémentaire de pension (notes 6 and 8)
 *
 * The numeric codes (101, 102, 103, 105, 141) are the ACD's electronic
 * certificate codes. Codes 101/102/103/105 are already accepted by the engine
 * today; 141 is the mortgage-interest line of the certificate.
 *
 * Codes FD, FO, FFO, DS, FDS, CE and AC are deductions the employer enters on
 * the fiche de retenue. They reduce the withholding base, not the taxable
 * base the taxpayer declares, so they are known but deliberately unsupported
 * as return facts: `supported: false` makes the engine warn instead of
 * silently swallowing the fact.
 *
 * This table is the single place where a certificate code becomes an engine
 * category / field key. Anything absent here is reported as unknown by the
 * engine rather than dropped.
 *
 * Sources: modèle 160F 2025 PDF in the workspace (`tmp/160f-25.pdf`), notes
 * 3, 6 and 8. The exact official numeric-code list beyond the five codes the
 * audit already named was not retrieved; adding a code here is a data change,
 * not a code change.
 */

export interface Certificate160Code {
  code: string;
  labelFr: string;
  labelDe: string;
  category: string;
  fieldKey: string;
  supported: boolean;
  note?: string;
}

/** Shared note for the fiche-de-retenue deduction labels (160F note 6). */
const FICHE_DE_RETENUE_NOTE =
  'Deduction entered by the employer on the fiche de retenue (modèle 160F, note 6). It reduces the withholding base only: it is not a return fact and has no Form 100 case, so the engine ignores it.';

export const CERTIFICATE_160_CODES: Record<string, Certificate160Code> = {
  '101': {
    code: '101',
    labelFr: 'Rémunération brute — salaire',
    labelDe: 'Bruttoarbeitslohn — Gehalt',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: 'grossSalary',
    supported: true,
    note: 'Gross pay of the first employment contract (modèle 160F section A).',
  },
  '102': {
    code: '102',
    labelFr: 'Rémunération brute — deuxième contrat / complément',
    labelDe: 'Bruttoarbeitslohn — Zweitvertrag / Ergänzung',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: 'grossSalary',
    supported: true,
    note: 'Second employment contract or complement; added to the same gross salary as 101, not a separate box.',
  },
  '103': {
    code: '103',
    labelFr: 'Cotisations sociales déductibles (C)',
    labelDe: 'Abzugsfähige Sozialversicherungsbeiträge (C)',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: 'socialSecurity',
    supported: true,
    note: 'Section B.1 of the certificate: the deductible social-security contributions withheld from the salary. The note-3 letter C is a section-A gross-pay component, not this 103 deduction.',
  },
  '105': {
    code: '105',
    labelFr: "Retenue d'impôt (E)",
    labelDe: 'Einbehaltene Lohnsteuer (E)',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: 'withholdingTax',
    supported: true,
    note: 'Section E (impôt retenu) of the certificate.',
  },
  '141': {
    code: '141',
    labelFr: "Intérêts débiteurs — habitation personnelle",
    labelDe: 'Schuldzinsen — selbstgenutztes Wohneigentum',
    category: 'MORTGAGE_INTEREST',
    fieldKey: 'mortgageInterest',
    supported: true,
    note: 'Interest withheld/deducted for the taxpayer’s own home; deductible up to the Art. 105 caps in the engine.',
  },
  S: {
    code: 'S',
    labelFr: 'Salaire',
    labelDe: 'Gehalt',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: 'grossSalary',
    supported: true,
    note: 'Certificate letter code S (160F note 3): salary, including overtime, benefits in kind and non-periodic pay taxed as salary.',
  },
  C: {
    code: 'C',
    labelFr: 'Cotisation de sécurité sociale complémentaire',
    labelDe: 'Zusätzlicher Sozialversicherungsbeitrag',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: 'Certificate letter code C (160F note 3): a section-A gross-pay component (complementary social-security contribution), not the section-B 103 deduction. The engine has no separate line for it, so it warns rather than netting it silently.',
  },
  R: {
    code: 'R',
    labelFr: "Rappels d'années antérieures",
    labelDe: 'Nachzahlungen früherer Jahre',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: 'Certificate letter code R (160F note 3): prior-year arrears. Which year they belong to depends on the LIR Art. 132 timing rule, so the engine cannot place them automatically; review manually.',
  },
  P: {
    code: 'P',
    labelFr: 'Pension',
    labelDe: 'Pension',
    category: 'PENSION_INCOME',
    fieldKey: 'grossPension',
    supported: true,
    note: 'Certificate letter code P (160F note 3): pension or annuity.',
  },
  LRCP: {
    code: 'LRCP',
    labelFr: 'Régime complémentaire de pension',
    labelDe: 'Zusatzrentenregime',
    category: 'LRCP_CONTRIBUTION',
    fieldKey: 'lrcp',
    supported: true,
    note: '160F notes 6 and 8. Unlike the other note-6 labels this one is a deductible contribution (LIR Art. 110 n° 3), so it is mapped to the lrcp deduction.',
  },

  // --- known withholding-base labels: deliberately not return facts ---------
  FD: {
    code: 'FD',
    labelFr: 'Frais de déplacement',
    labelDe: 'Fahrtkosten',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
  FO: {
    code: 'FO',
    labelFr: "Frais d'obtention",
    labelDe: 'Werbungskosten',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
  FFO: {
    code: 'FFO',
    labelFr: "Forfait pour frais d'obtention",
    labelDe: 'Pauschbetrag für Werbungskosten',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
  DS: {
    code: 'DS',
    labelFr: 'Dépenses spéciales',
    labelDe: 'Sonderausgaben',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
  FDS: {
    code: 'FDS',
    labelFr: 'Forfait pour dépenses spéciales',
    labelDe: 'Pauschbetrag für Sonderausgaben',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
  CE: {
    code: 'CE',
    labelFr: 'Charges extraordinaires',
    labelDe: 'Außergewöhnliche Belastungen',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
  AC: {
    code: 'AC',
    labelFr: 'Abattement conjoint',
    // The German 160F wording for "abattement conjoint" is not in the local
    // corpus, so the French legal term is kept rather than guessed.
    labelDe: 'Abattement conjoint (AC)',
    category: 'EMPLOYMENT_INCOME',
    fieldKey: '',
    supported: false,
    note: FICHE_DE_RETENUE_NOTE,
  },
};

/**
 * Canonical form of a certificate code: trimmed, upper-cased and stripped of
 * the `code_` prefix the extractor adds to fact field keys.
 */
export function normalizeCertificate160Code(raw: string | null | undefined): string {
  if (raw == null) return '';
  return raw.trim().toUpperCase().replace(/^CODE_/, '');
}

/** Look a certificate-160 code up; unknown codes return `undefined`. */
export function lookupCertificate160Code(
  raw: string | null | undefined,
): Certificate160Code | undefined {
  const code = normalizeCertificate160Code(raw);
  if (!code) return undefined;
  return CERTIFICATE_160_CODES[code];
}

/**
 * True when a fact `fieldKey` is a certificate code rather than an engine
 * field key: the extractor's `code_` prefix, a bare three-digit code, a bare
 * single letter (S, C, R, P — or any other note-3 letter, so an unmapped one
 * warns instead of vanishing) or any other key of the table (FD, FFO, LRCP, …).
 * Engine field keys are camelCase, so they never match. A single letter is
 * certificate-shaped even when the table has no entry for it: the printed 160F
 * letter set is open-ended, and a silent drop is the failure LEG-7 forbids.
 */
export function isCertificate160FieldKey(fieldKey: string | null | undefined): boolean {
  if (fieldKey == null) return false;
  const trimmed = fieldKey.trim();
  if (!trimmed) return false;
  if (/^code_/i.test(trimmed)) return true;
  const normalized = normalizeCertificate160Code(trimmed);
  return (
    /^\d{3}$/.test(normalized) ||
    /^[A-Z]$/.test(normalized) ||
    // Any all-caps 2–4 letter token is certificate-shaped: the printed 160F code
    // set is open-ended (FD, FFO, LRCP, and employer-specific variants), so an
    // unknown `ZZ` / `FDD` must warn instead of being dropped. Engine field keys
    // are camelCase, so this cannot capture one.
    (/^[A-Z]{2,4}$/.test(normalized) && trimmed === normalized) ||
    CERTIFICATE_160_CODES[normalized] !== undefined
  );
}
