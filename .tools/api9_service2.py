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
import { hashCalculationResult } from './calculation-history';""")

rep("""      await this.prisma.taxYearWorkspace.update({
        where: { id: workspaceId },
        data: {
          taxClass,
          estimatedTaxBalance: new Prisma.Decimal(result.balancePayableOrRefund),
          calculationResult: calculation as any,""",
"""      // API-9: the workspace keeps the latest result for reads; every calculation
      // also lands in an append-only snapshot so earlier figures survive.
      await this.prisma.calculationSnapshot.create({
        data: {
          workspaceId,
          taxYear: calculation.taxYear,
          taxClass,
          rulePackageVersion: calculation.rulePackageVersion,
          resultSha256: hashCalculationResult(calculation),
          resultJson: calculation as any,
          createdById: actorId,
        },
      });

      await this.prisma.taxYearWorkspace.update({
        where: { id: workspaceId },
        data: {
          taxClass,
          estimatedTaxBalance: new Prisma.Decimal(result.balancePayableOrRefund),
          calculationResult: calculation as any,""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
