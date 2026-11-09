import io

# export treaties
p = "packages/tax-engine/src/rules/index.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export * from './types';""", """export * from './types';
export * from './treaties';""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# contracts: foreign items + credit field
p2 = "packages/contracts/src/tax.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """  /** Art. 157ter / Art. 3 d): non-resident assimilation inputs. */"""
new2 = """  /** Foreign income by treaty partner, for the relief method. */
  foreignIncomeItems?: Array<{
    country: string;
    amount: number;
    foreignTax: number;
    /** Overrides the default method for that country. */
    method?: 'EXEMPTION_PROGRESSION' | 'CREDIT';
  }>;

  /** Art. 157ter / Art. 3 d): non-resident assimilation inputs. */"""
assert s2.count(old2) == 1
s2 = s2.replace(old2, new2)

old3 = """  /** Credit for resident investors in eligible start-ups (2026+). */
  startup: number;"""
new3 = """  /** Credit for resident investors in eligible start-ups (2026+). */
  startup: number;
  /** Foreign tax credited under the treaty / Art. 134bis. */
  foreignTaxCredit: number;"""
assert s2.count(old3) == 1
s2 = s2.replace(old3, new3)
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
