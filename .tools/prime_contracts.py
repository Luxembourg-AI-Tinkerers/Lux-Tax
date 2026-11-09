import io
p = "packages/contracts/src/tax.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """  /** Art. 114 loss stock, per year of origin (17-year clock, oldest first). */"""
add = """  /**
   * Prime jeune salarié (Art. 115 n° 13d): amount of the prime received and
   * whether the legal conditions are met (under 30 on 1 January, first CDI with a
   * Luxembourg employer, first prime less than 5 years ago).
   */
  youngEmployeePrime?: number;
  youngEmployeePrimeEligible?: boolean;

  /** Art. 114 loss stock, per year of origin (17-year clock, oldest first). */"""
assert s.count(anchor) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(anchor, add).replace("\n", "\r\n"))
print("ok")
