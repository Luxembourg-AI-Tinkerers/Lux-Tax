import io
p = "apps/api/src/modules/calculations/calculations.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""import { Prisma } from '@prisma/client';""",
"""import { Prisma } from '@prisma/client';
import { hashCalculationResult, summariseCalculation } from './calculation-history';""")

rep("""    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: {
        taxClass,
        estimatedTaxBalance: new Prisma.Decimal(result.balancePayableOrRefund),
        calculationResult: result as any,""",
"""    // API-9: keep the latest result on the workspace for reads, and append an
    // immutable snapshot so earlier calculations are not lost.
    await this.prisma.calculationSnapshot.create({
      data: {
        workspaceId,
        taxYear: result.taxYear,
        taxClass,
        rulePackageVersion: result.rulePackageVersion,
        resultSha256: hashCalculationResult(result),
        resultJson: result as any,
        createdById: actorId,
      },
    });

    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: {
        taxClass,
        estimatedTaxBalance: new Prisma.Decimal(result.balancePayableOrRefund),
        calculationResult: result as any,""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
