import io

# contracts
p = "packages/contracts/src/tax.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  /** Art. 157ter / Art. 3 d): non-resident assimilation inputs. */"""
new = """  /** Residence of the spouse, for the Art. 3 d) mixed-couple gate. */
  spouseResidence?: 'RESIDENT' | 'NON_RESIDENT';
  /** Both spouses ask for collective assessment under Art. 3 d). */
  mixedCoupleCollectiveRequested?: boolean;

  /** Art. 157ter / Art. 3 d): non-resident assimilation inputs. */"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# engine: compute the gate and use it
p2 = "packages/tax-engine/src/engine.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

def rep(old, new):
    global s2
    assert s2.count(old) == 1, (s2.count(old), old[:70])
    s2 = s2.replace(old, new)

rep("""    const isCollective = taxClass === TaxClass.CLASS_2 && assessmentMode !== 'INDIVIDUAL_PURE';""",
"""    const isCollective = taxClass === TaxClass.CLASS_2 && assessmentMode !== 'INDIVIDUAL_PURE';

    // Art. 3 d): a mixed resident/non-resident couple may opt for collective
    // assessment (and therefore Class 2) only when the resident spouse realises
    // at least 90 % of the household's professional income in Luxembourg.
    const isMixedCouple =
      (params.residence === 'NON_RESIDENT' && params.spouseResidence === 'RESIDENT') ||
      (params.residence === 'RESIDENT' && params.spouseResidence === 'NON_RESIDENT');
    const householdProfessionalIncomeForGate =
      params.householdProfessionalIncome ?? params.luxembourgProfessionalIncome ?? 0;
    const mixedProfessionalShare =
      householdProfessionalIncomeForGate > 0
        ? (params.luxembourgProfessionalIncome ?? 0) / householdProfessionalIncomeForGate
        : 0;
    const mixedCoupleCollectiveGranted =
      isMixedCouple && Boolean(params.mixedCoupleCollectiveRequested) && mixedProfessionalShare >= 0.9;""")

rep("""    if (params.residence === 'NON_RESIDENT') {
      const worldwide = params.worldwideIncome ?? 0;""",
"""    if (isMixedCouple && !mixedCoupleCollectiveGranted) {
      warnings.push(
        'Mixed resident/non-resident couple: collective assessment (Art. 3 d) requires the resident spouse to realise at least 90 % of the household professional income in Luxembourg. The default separate treatment applies.',
      );
    }
    if (mixedCoupleCollectiveGranted) {
      provenance.push({
        ruleCode: 'LIR-ART-3-d',
        description:
          'Mixed resident/non-resident couple admitted to collective assessment (Art. 3 d): >= 90 % of household professional income in Luxembourg; taxed as resident under Art. 6 al. 4',
        sourceFactIds: [],
        formula: 'luProfessional / householdProfessional >= 0.90',
        inputs: { share: round2(mixedProfessionalShare * 100) },
        outputAmount: 0,
      });
    }

    if (params.residence === 'NON_RESIDENT' && !mixedCoupleCollectiveGranted) {
      const worldwide = params.worldwideIncome ?? 0;""")

rep("""    const effectiveClass: 'CLASS_1' | 'CLASS_1A' | 'CLASS_2' =
      pkg.singleClass
        ? 'CLASS_1'
        : taxClass === TaxClass.CLASS_2 && !spouseUserId
          ? 'CLASS_1'
          : (taxClass as 'CLASS_1' | 'CLASS_1A' | 'CLASS_2');""",
"""    const effectiveClass: 'CLASS_1' | 'CLASS_1A' | 'CLASS_2' =
      pkg.singleClass
        ? 'CLASS_1'
        : mixedCoupleCollectiveGranted
          ? 'CLASS_2'
          : taxClass === TaxClass.CLASS_2 && !spouseUserId
            ? 'CLASS_1'
            : (taxClass as 'CLASS_1' | 'CLASS_1A' | 'CLASS_2');""")

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
