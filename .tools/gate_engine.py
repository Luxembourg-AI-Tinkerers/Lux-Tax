import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("""    if (taxYear === 2026 && !pkg.cic) {
      warnings.push(
        'CIC 2026: projet de loi 8775 (first constitutional vote 28.10.2026) reintroduces the crédit d’impôt conjoncture for June–October 2026, bonified by 31.12.2026. The monthly table is not yet published and the law is not in force, so no CIC is computed (ACD newsletter 30.10.2026).',
      );
    }""",
"""    // Pending measures: advertised, sourced, and switched off until publication.
    for (const measure of pkg.pendingMeasures ?? []) {
      if (measure.status === 'IN_FORCE') continue;
      if (measure.id === 'CIC_2026') {
        warnings.push(
          `CIC 2026 not computed: ${measure.source}. Activation is a package edit — ${measure.activation}.`,
        );
      }
    }

    // Épargne-logement: a subscriber above 40 is capped at EUR 672 under current
    // law; the pending 8775 measure would remove that age limit.
    const savingsSubscriberAge = params.savingsHousingSubscriberAge;
    const epargnePending = (pkg.pendingMeasures ?? []).find(
      (m) => m.id === 'EPARGNE_LOGEMENT_8775' && m.status === 'NOT_IN_FORCE',
    );
    if (
      epargnePending &&
      savingsHousing > 0 &&
      savingsSubscriberAge !== undefined &&
      savingsSubscriberAge > pkg.specialExpenses.savingsHousingYoungMaxAge
    ) {
      warnings.push(
        `Épargne-logement capped at ${pkg.specialExpenses.savingsHousingStandard} EUR because the subscriber is over ${pkg.specialExpenses.savingsHousingYoungMaxAge}. Projet de loi 8775 would remove that age limit once in force (${epargnePending.source}).`,
      );
    }""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
