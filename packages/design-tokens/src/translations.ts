export type SupportedLanguage = 'en' | 'fr' | 'de';

export interface TaxTermTranslation {
  readonly key: string;
  readonly en: string;
  readonly fr: string;
  readonly de: string;
  readonly legalReference?: string;
}

export const LUXEMBOURG_TAX_TERMS: readonly TaxTermTranslation[] = [
  {
    key: 'salary_certificate',
    en: 'Salary / Pension Certificate',
    fr: 'Certificat de rémunération / de pension',
    de: 'Lohnsteuerbescheinigung / Rentenbescheinigung',
    legalReference: 'L.I.R. Art. 95',
  },
  {
    key: 'gross_salary',
    en: 'Gross Salary (Box 101/102)',
    fr: 'Rémunération brute (Case 101/102)',
    de: 'Bruttoarbeitslohn (Feld 101/102)',
    legalReference: 'L.I.R. Art. 95',
  },
  {
    key: 'social_contributions',
    en: 'Social Security Contributions (Box 103)',
    fr: 'Cotisations sociales déductibles (Case 103)',
    de: 'Sozialversicherungsbeiträge (Feld 103)',
    legalReference: 'L.I.R. Art. 110',
  },
  {
    key: 'withholding_tax',
    en: 'Withholding Tax Paid at Source (Box 105)',
    fr: 'Retenue d\'impôt à la source (Case 105)',
    de: 'Einbehaltene Lohnsteuer (Feld 105)',
    legalReference: 'L.I.R. Art. 136',
  },
  {
    key: 'frais_obtention',
    en: 'Standard Employment Deduction',
    fr: 'Frais d\'obtention forfaitaires',
    de: 'Werbungskostenpauschale',
    legalReference: 'L.I.R. Art. 107',
  },
  {
    key: 'mortgage_interest',
    en: 'Primary Residence Mortgage Interest',
    fr: 'Intérêts débiteurs pour habitation principale',
    de: 'Schuldzinsen für die Hauptwohnung',
    legalReference: 'L.I.R. Art. 102',
  },
  {
    key: 'special_expenses',
    en: 'Special Expenses (Art. 111 Insurance & Art. 112 Gifts)',
    fr: 'Dépenses spéciales (Prévoyance vieillesse & Dons)',
    de: 'Sonderausgaben (Altersvorsorge & Spenden)',
    legalReference: 'L.I.R. Art. 109-112',
  },
  {
    key: 'solidarity_surcharge',
    en: 'Solidarity Surcharge (Employment Fund 7%)',
    fr: 'Contribution au Fonds pour l\'emploi (7%)',
    de: 'Beschäftigungsfonds-Beitrag (7%)',
    legalReference: 'Loi du 30 juin 1976',
  },
  {
    key: 'cis_credit',
    en: 'Employee Tax Credit (CIS up to €600)',
    fr: 'Crédit d\'impôt salarié (CIS jusqu\'à 600 €)',
    de: 'Steuergutschrift für Arbeitnehmer (CIS bis zu 600 €)',
    legalReference: 'L.I.R. Art. 139ter',
  },
  {
    key: 'splitting_method',
    en: 'Class 2 Splitting Method (Married Couples)',
    fr: 'Méthode de fractionnement (Classe 2)',
    de: 'Splitting-Verfahren (Steuerklasse 2)',
    legalReference: 'L.I.R. Art. 121',
  },
  {
    key: 'bulletin_imposition',
    en: 'ACD Tax Assessment Notice',
    fr: 'Bulletin d\'imposition ACD',
    de: 'Steuerbescheid der Steuerverwaltung',
    legalReference: 'L.G.O. § 211',
  },
  {
    key: 'form_100',
    en: 'Form 100 - Income Tax Return',
    fr: 'Modèle 100 - Déclaration pour l\'impôt sur le revenu',
    de: 'Vordruck 100 - Einkommensteuererklärung',
    legalReference: 'ACD Form 100',
  },
] as const;

export function getTermTranslation(key: string, lang: SupportedLanguage = 'en'): string {
  const term = LUXEMBOURG_TAX_TERMS.find((t) => t.key === key);
  if (!term) return key;
  return term[lang] || term.en;
}
