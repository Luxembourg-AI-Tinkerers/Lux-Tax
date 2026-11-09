import io
p = "apps/api/src/modules/filing/filing.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """        household: {
          include: { members: { include: { user: { include: { profile: true } } } } },
        },"""
new = """        household: {
          include: {
            members: { include: { user: { include: { profile: true } } } },
            dependants: true,
          },
        },"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# R4 hook: rule package field + 2028 config + engine warning
p2 = "packages/tax-engine/src/rules/types.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""  /** True for the 2028 single-class ("classe U") package. */
  readonly singleClass?: boolean;""",
"""  /** True for the 2028 single-class ("classe U") package. */
  readonly singleClass?: boolean;
  /**
   * Structural hook for the 2028 transition of couples already taxed
   * collectively. `method: 'NONE'` means the parameters are not yet published
   * and no blend is applied.
   */
  readonly classUTransition?: { readonly years: number; readonly method: 'NONE' | 'PHASE_IN' };""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))

p3 = "packages/tax-engine/src/rules/2028.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
s3 = s3.replace("""  singleClass: true,
};""",
"""  singleClass: true,
  // 25-year transition announced for couples already in collective assessment.
  // The blend formula is not published, so method stays 'NONE'.
  classUTransition: { years: 25, method: 'NONE' },
};""")
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace("\n", "\r\n"))

p4 = "packages/tax-engine/src/engine.ts"
raw4 = io.open(p4, encoding="utf-8", newline="").read()
s4 = raw4.replace("\r\n", "\n")
old4 = """    if (pkg.singleClass) {
      warnings.push(
        `Tax year ${taxYear} uses the single-class ("classe U") preview package: legacy class values are accepted but one tariff applies. Transition rules are not implemented.`,
      );
    }"""
new4 = """    if (pkg.singleClass) {
      warnings.push(
        `Tax year ${taxYear} uses the single-class ("classe U") preview package: legacy class values are accepted but one tariff applies.`,
      );
      if (spouseUserId && pkg.classUTransition) {
        warnings.push(
          `The ${pkg.classUTransition.years}-year transition for couples already taxed collectively is not applied (parameters not published; method ${pkg.classUTransition.method}).`,
        );
      }
    }"""
assert s4.count(old4) == 1
io.open(p4, "w", encoding="utf-8", newline="").write(s4.replace(old4, new4).replace("\n", "\r\n"))
print("ok")
