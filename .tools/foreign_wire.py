import io

p = r"B:\B\tax-app\apps\api\src\modules\filing\filing.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """        case "FOREIGN_INCOME":
          // The 100F has no foreign-income sheet: 1101 is the substantial-
          // participation capital-gains line. Point at the exempt column of the
          // category sheet and at the RD 1081/1082 credit instead of emitting a
          // wrong box. The amount and the fact id stay for traceability.
          addBox(
            FORM100_INSTRUCTIONS.foreignCredit,
            undefined,
            owner,
            "Foreign income — declare in the exempt column of the relevant category sheet (S/P/CM/L); claim the foreign tax credit on RD 1081/1082.",
            "Auslaendische Einkuenfte — in der Spalte der befreiten Einkuenfte des betreffenden Blattes (S/P/CM/L) angeben; die auslaendische Steuer auf RD 1081/1082 anrechnen.",
            amount,
            fact.id,
            "INSTRUCTION",
          );
          break;"""

new = """        case "FOREIGN_INCOME": {
          // The 100F has no foreign-income sheet: 1101 is the substantial-
          // participation capital-gains line. Point at the exempt column of the
          // category sheet and at the RD 1081/1082 credit instead of emitting a
          // wrong box. When the fact's field key names a nature, the sheet is
          // named precisely; otherwise the generic S/P/CM/L sentence stands —
          // guessing a sheet would be worse than naming all four. The amount and
          // the fact id stay for traceability.
          const nature = foreignNatureSheet(fact.fieldKey);
          if (nature) {
            addBox(
              FORM100_INSTRUCTIONS.foreignCreditOnSheet(nature.sheet, nature.page),
              undefined,
              owner,
              `Foreign ${nature.label} — declare in the exempt-income column of sheet ${nature.sheet}; claim the foreign tax credit on RD 1081/1082.`,
              `Auslaendische ${nature.label} — in der Spalte der befreiten Einkuenfte des Blattes ${nature.sheet} angeben; die auslaendische Steuer auf RD 1081/1082 anrechnen.`,
              amount,
              fact.id,
              "INSTRUCTION",
            );
          } else {
            addBox(
              FORM100_INSTRUCTIONS.foreignCredit,
              undefined,
              owner,
              "Foreign income — declare in the exempt column of the relevant category sheet (S/P/CM/L); claim the foreign tax credit on RD 1081/1082.",
              "Auslaendische Einkuenfte — in der Spalte der befreiten Einkuenfte des betreffenden Blattes (S/P/CM/L) angeben; die auslaendische Steuer auf RD 1081/1082 anrechnen.",
              amount,
              fact.id,
              "INSTRUCTION",
            );
          }
          break;
        }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

# import the helper
old_imp = "import { FORM100_CASES, FORM100_INSTRUCTIONS, RECAP } from './form100-case-map';"
assert s.count(old_imp) == 1
s = s.replace(
    old_imp,
    "import {\n  FORM100_CASES,\n  FORM100_INSTRUCTIONS,\n  RECAP,\n  foreignNatureSheet,\n} from './form100-case-map';",
)

io.open(p, "w", encoding="utf-8", newline=nl).write(s.replace("\n", nl))
print("ok")
