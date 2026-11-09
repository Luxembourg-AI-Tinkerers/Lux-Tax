import io
p = "packages/tax-engine/src/rules/types.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "export interface RulePackage {"
addition = '''export interface AsrdRules {
  /** Majoration de base for a single premium (assurance solde restant dû). */
  readonly baseCap: number;
  /** Extra majoration per child with modération. */
  readonly perChild: number;
  /** Surmajoration: 8 % of the majoration per year of age above the threshold. */
  readonly surmajorationPerYear: number;
  readonly surmajorationMax: number;
  readonly ageThreshold: number;
}

export interface PlusValueRules {
  /** Movable property: speculation window in months (Art. 99bis). */
  readonly movableHoldingMonths: number;
  /** Annual speculative profit below this is exempt. */
  readonly speculationFloor: number;
  /** Substantial participation threshold (Art. 100). */
  readonly substantialParticipation: number;
  readonly participationLookbackYears: number;
  /** Real estate: speculation window in years (Art. 99bis). */
  readonly realEstateHoldingYears: number;
  /** Art. 130 al. 4 abattement on 99ter / 100 / 101 gains. */
  readonly abattementSingle: number;
  readonly abattementJoint: number;
}

export interface StartupCreditRules {
  readonly rate: number;
  readonly maxInvestment: number;
}

export interface RulePackage {'''

assert s.count(anchor) == 1
s = s.replace(anchor, addition)

# add fields inside RulePackage before closing brace of interface
old_tail = """  /** TVA franchise threshold (informational, not a PIT figure). */
  readonly tvaFranchise: number;
}"""
new_tail = """  /** TVA franchise threshold (informational, not a PIT figure). */
  readonly tvaFranchise: number;
  readonly asrd: AsrdRules;
  readonly plusValues: PlusValueRules;
  readonly startupCredit: StartupCreditRules;
  /** True for the 2028 single-class ("classe U") package. */
  readonly singleClass?: boolean;
}"""
assert s.count(old_tail) == 1
s = s.replace(old_tail, new_tail)

out = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("ok")
