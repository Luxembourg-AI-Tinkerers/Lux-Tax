import io
p = "apps/api/src/modules/filing/filing.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""import { PrismaService } from '../../prisma/prisma.service';""",
"""import { PrismaService } from '../../prisma/prisma.service';
import { assertFilingYearAllowed, FilingPackageNotAllowedError } from './filing-year-guard';""")

rep("""    if (!workspace || !workspace.calculationResult) {
      throw new BadRequestException('Workspace does not have a calculated return');
    }

    const returnVersion = await this.prisma.returnVersion.findFirst({""",
"""    if (!workspace || !workspace.calculationResult) {
      throw new BadRequestException('Workspace does not have a calculated return');
    }

    // LEG-9: never build a filing package from a preview rule package (2028
    // single class). Those values would be copied into a real return.
    try {
      assertFilingYearAllowed(workspace.taxYear);
    } catch (error) {
      if (error instanceof FilingPackageNotAllowedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const returnVersion = await this.prisma.returnVersion.findFirst({""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
