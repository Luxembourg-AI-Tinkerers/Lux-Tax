import io

p = r"B:\B\tax-app\packages\tax-engine\test\tax-engine.spec.ts"
s = io.open(p, encoding="utf-8-sig", newline="").read()

old = """  test('engine: child relief is imputed only on what the CIM left, and never reduces the refund', () => {
    const withRelief = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      childBenefitReceived: false,
      isSingleParent: true,
    });

    // The CIM covers the 749.96 still due, so the Art. 122 relief has no base
    // left; it is non-refundable and cannot turn into a payout of its own.
    close(withRelief.childRelief.degrevement, 0);
    close(withRelief.childRelief.total, 0);
    close(withRelief.credits.cimApplied, 749.96);
    close(withRelief.credits.cimRefund, 2_754.04);
    close(withRelief.finalTaxLiability, 0);
    close(withRelief.balancePayableOrRefund, -2_754.04);
  });""".replace("\n", "\r\n")

new = """  test('engine: the non-refundable child relief is imputed before the refundable CIM', () => {
    const withRelief = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      childBenefitReceived: false,
      isSingleParent: true,
    });

    // Art. 122 is non-refundable and Art. 154ter al. 2 pays the CIM excess out,
    // so the relief goes first: imputing the refundable credit first would
    // extinguish the tax the relief must reduce and destroy 922.50 (here the
    // whole 749.96 of tax still due, the relief being capped at the tax).
    close(withRelief.childRelief.degrevement, 749.96);
    close(withRelief.childRelief.total, 749.96);
    close(withRelief.credits.cimApplied, 0);
    close(withRelief.credits.cimRefund, 3_504);
    close(withRelief.finalTaxLiability, 0);
    close(withRelief.balancePayableOrRefund, -3_504);
  });

  test('engine: the ordering change never costs the household money', () => {
    // Same household, relief denied. The CIM alone already zeroes the tax, so
    // the refund must be the full 3 504 either way: the relief only decides
    // which instrument absorbs the 749.96, never whether it is paid.
    const withoutRelief = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      childBenefitReceived: true,
      isSingleParent: true,
    });

    close(withoutRelief.childRelief.total, 0);
    close(withoutRelief.credits.cimApplied, 749.96);
    close(withoutRelief.credits.cimRefund, 2_754.04);
    close(withoutRelief.balancePayableOrRefund, -2_754.04);

    const withRelief = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      childBenefitReceived: false,
      isSingleParent: true,
    });

    // The household is strictly better off by the relief it is entitled to —
    // never worse: final liability stays 0 and the refund does not shrink.
    assert.ok(withRelief.balancePayableOrRefund <= withoutRelief.balancePayableOrRefund);
    close(withRelief.finalTaxLiability, withoutRelief.finalTaxLiability);
    close(
      withRelief.credits.cimRefund - withoutRelief.credits.cimRefund,
      withRelief.childRelief.total,
    );
  });""".replace("\n", "\r\n")

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
