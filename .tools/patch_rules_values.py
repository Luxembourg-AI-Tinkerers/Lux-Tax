import io

# --- 2025 additions
p = "packages/tax-engine/src/rules/2025.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  art111bisCapPerPerson: 3_200,
  capitalTrancheExemptee: 1_500,
  ccssPensionRate: 0.16,
  tvaFranchise: 50_000,
};"""
new = """  art111bisCapPerPerson: 3_200,
  capitalTrancheExemptee: 1_500,
  ccssPensionRate: 0.16,
  tvaFranchise: 50_000,
  asrd: {
    baseCap: 6_000,
    perChild: 1_200,
    surmajorationPerYear: 0.08,
    surmajorationMax: 1.6,
    ageThreshold: 30,
  },
  plusValues: {
    movableHoldingMonths: 6,
    speculationFloor: 500,
    substantialParticipation: 0.1,
    participationLookbackYears: 5,
    realEstateHoldingYears: 5,
    abattementSingle: 50_000,
    abattementJoint: 100_000,
  },
  // The start-up credit is a 2026 measure; 2025 has no such credit.
  startupCredit: { rate: 0, maxInvestment: 0 },
};"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# --- 2026 additions
p2 = "packages/tax-engine/src/rules/2026.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """  amvp: {
    cap: 9_000,
    monthly: 750,
  },
  ccssPensionRate: 0.17,
};"""
new2 = """  amvp: {
    cap: 9_000,
    monthly: 750,
  },
  ccssPensionRate: 0.17,
  // Credit for resident individuals investing in eligible start-ups (mfin 2026):
  // 20 % of the investment, capped at EUR 100 000 invested per year.
  startupCredit: { rate: 0.2, maxInvestment: 100_000 },
};"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))
print("ok")
