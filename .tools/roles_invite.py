import io

# ---- 1. Invitation acceptance requires a verified address -------------------
p = r"B:\B\tax-app\apps\api\src\modules\households\households.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    // The token names a recipient. Without this check ANY signed-in user holding
    // the link could join the household, and — because the upsert below used to
    // rewrite the role — an existing PRIMARY_FILER who opened a CO_FILER
    // invitation was silently demoted.
    if (user.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was issued to a different e-mail address. Sign in with the invited account.',
      );
    }"""

new = """    // The token names a recipient. Without this check ANY signed-in user holding
    // the link could join the household, and — because the upsert below used to
    // rewrite the role — an existing PRIMARY_FILER who opened a CO_FILER
    // invitation was silently demoted.
    if (user.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was issued to a different e-mail address. Sign in with the invited account.',
      );
    }

    // Matching an address proves nothing unless the account proved it owns that
    // address. Without this, an invitation is claimed by whoever registers the
    // invited address first, and joins the household with full co-filer rights.
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Verify your e-mail address before accepting an invitation.',
      );
    }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

# ---- 2. @Roles on the three viewer-writable routes -------------------------
def add_roles(path, anchor, decorator_line, import_anchor, import_line):
    raw = io.open(path, encoding="utf-8-sig", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")
    if "Roles } from" not in s and "Roles," not in s:
        assert s.count(import_anchor) == 1, (path, "import anchor")
        s = s.replace(import_anchor, import_anchor + "\n" + import_line)
    assert s.count(anchor) == 1, (path, "route anchor", s.count(anchor))
    s = s.replace(anchor, decorator_line + "\n" + anchor)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

add_roles(
    r"B:\B\tax-app\apps\api\src\modules\calculations\calculations.controller.ts",
    "  @Post('calculate')",
    "  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)",
    "import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';",
    "import { Roles } from '../../common/decorators/roles.decorator';",
)
add_roles(
    r"B:\B\tax-app\apps\api\src\modules\workspaces\workspaces.controller.ts",
    "  @Post()",
    "  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)",
    "import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';",
    "import { Roles } from '../../common/decorators/roles.decorator';",
)
add_roles(
    r"B:\B\tax-app\apps\api\src\modules\questionnaire\questionnaire.controller.ts",
    "  @Post('tasks/:taskId/resolve')",
    "  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)",
    "import { Roles } from '../../common/decorators/roles.decorator';",
    "import { HouseholdRole } from '@luxtax/contracts';",
)

print("ok")
