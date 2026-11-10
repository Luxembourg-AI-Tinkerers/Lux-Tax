import io

p = r"B:\B\tax-app\apps\api\src\modules\calculations\calculations.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    if (!workspace || !workspace.calculationResult) {
      return null;
    }

    return workspace.calculationResult as unknown as TaxCalculationResultDto;"""

new = """    if (!workspace || !workspace.calculationResult) {
      return null;
    }

    // A snapshot stored by an earlier model version may predate
    // `specialExpensesCovered` or the CIM split. Reconstruct only what the
    // stored numbers determine, and leave the rest for the UI to label as a
    // stale estimate — never invent a line the result does not support.
    const normalized = normalizeStoredCalculation(workspace.calculationResult);
    return normalized ? normalized.calculation : null;"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

anchor = "import { PrismaService } from '../../prisma/prisma.service';"
assert s.count(anchor) == 1
s = s.replace(
    anchor,
    anchor + "\nimport { normalizeStoredCalculation } from './calculation-snapshot';",
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
