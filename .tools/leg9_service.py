import io
p = "apps/api/src/modules/filing/filing.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

# import the guard next to the other local imports
rep("""import { PrismaService } from '../../prisma/prisma.service';""",
"""import { PrismaService } from '../../prisma/prisma.service';
import { assertFilingYearAllowed, FilingPackageNotAllowedError } from './filing-year-guard';""")

# guard inside generateFilingPackage, right after the workspace load
rep("""    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Verify both spouses have approved""",
"""    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // LEG-9: never build a filing package from a preview rule package (2028
    // single class). The values would be copied into a real return.
    try {
      assertFilingYearAllowed(workspace.taxYear);
    } catch (error) {
      if (error instanceof FilingPackageNotAllowedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    // Verify both spouses have approved""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
