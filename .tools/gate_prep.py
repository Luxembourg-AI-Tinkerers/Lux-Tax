import io

# 1) types: pending measures
p = "packages/tax-engine/src/rules/types.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export interface RulePackage {""",
"""/**
 * A measure that is known but not yet in force. It records the legal source and
 * the exact data change that activates it, so publication is a package edit and
 * nothing else.
 */
export interface PendingMeasure {
  readonly id: string;
  readonly status: 'NOT_IN_FORCE' | 'IN_FORCE';
  /** Where the measure comes from (projet de loi, newsletter, Mémorial). */
  readonly source: string;
  /** The one-line change that activates it in this package. */
  readonly activation: string;
}

export interface RulePackage {""")
s = s.replace("""  readonly classUTransition?: { readonly years: number; readonly method: 'NONE' | 'PHASE_IN' };""",
"""  readonly classUTransition?: { readonly years: number; readonly method: 'NONE' | 'PHASE_IN' };
  /** Measures known but awaiting publication / entry into force. */
  readonly pendingMeasures?: readonly PendingMeasure[];""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 2) 2026 package: record the two pending measures
p2 = "packages/tax-engine/src/rules/2026.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""  // 2026: energy-renovation amortisation rises from 6 % to 10 %.
  rentalAmortisation: { ...RULES_2025.rentalAmortisation, energyRenovationRate: 0.1 },""",
"""  // 2026: energy-renovation amortisation rises from 6 % to 10 %.
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
  ],""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
