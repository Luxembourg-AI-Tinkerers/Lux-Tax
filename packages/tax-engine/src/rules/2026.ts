import type { RulePackage } from './types';
import { RULES_2025, SCALE_2025 } from './2025';

/**
 * Tax year 2026.
 *
 * Art. 118 tariff unchanged (no 2026 barème published; ACD publishes only the
 * "à partir de l'année d'imposition 2025" scale).
 *
 * Changes vs 2025:
 *  - Art. 111bis / 111ter cap: €3 200 → €4 500 per souscripteur (loi 19.12.2025).
 *  - CI-CO2: €192 → €216, slope 0.0048 → 0.0054.
 *  - AMVP Art. 129g: new, up to €9 000 / year (€750 / month).
 *  - CCSS pension rate for independents: 16 % → 17 %.
 *
 * Deliberately NOT modelled: crédit d'impôt conjoncture 2026 (amounts not yet
 * published in a Mémorial text as of 2026-11-08) and the épargne-logement
 * 40-year age-limit suppression (loi 8775, not pinned).
 */
export const RULES_2026: RulePackage = {
  ...RULES_2025,
  taxYear: 2026,
  version: '2026.1.0',
  sourceRef: 'LIR 2026 (coord. 08.05.2026); loi 19.12.2025 (111bis €4 500, CI-CO2 €216, AMVP Art. 129g); mfin Nouveautés 2026',
  scale: SCALE_2025,
  ciCo2: {
    salarie: 216,
    pension: 216,
    independant: 216,
    slope: 0.0054,
    zeroFrom: 80_000,
  },
  art111bisCapPerPerson: 4_500,
  amvp: {
    cap: 9_000,
    monthly: 750,
  },
  ccssPensionRate: 0.17,
  // Credit for resident individuals investing in eligible start-ups (mfin 2026):
  // 20 % of the investment, capped at EUR 100 000 invested per year.
  startupCredit: { rate: 0.2, maxInvestment: 100_000 },
  // 2026: energy-renovation amortisation rises from 6 % to 10 %.
  rentalAmortisation: { ...RULES_2025.rentalAmortisation, energyRenovationRate: 0.1 },
  // Known measures awaiting publication of projet de loi 8775 (first
  // constitutional vote 28.10.2026; entry expected November 2026).
  // Activating either one is a data change in this file only.
  pendingMeasures: [
    {
      id: 'CIC_2026',
      status: 'NOT_IN_FORCE',
      source:
        'Projet de loi 8775 (1er vote constitutionnel 28.10.2026); ACD newsletter 30.10.2026 — CIC salarié/pensionné June–October 2026, bonified by 31.12.2026',
      activation: 'add cic: { bands: [...], topAmount: ... } with the monthly table published by the ACD',
    },
    {
      id: 'EPARGNE_LOGEMENT_8775',
      status: 'NOT_IN_FORCE',
      source:
        'Projet de loi 8775 (1er vote constitutionnel 28.10.2026) — suppression of the 40-year age limit for the increased épargne-logement cap',
      activation: 'set specialExpenses.savingsHousingYoungMaxAge to 200 (no age limit)',
    },
  ],
};
