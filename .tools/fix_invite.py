import io

p = r"B:\B\tax-app\apps\api\src\modules\households\households.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Upsert membership
    await this.prisma.householdMembership.upsert({
      where: {
        householdId_userId: {
          householdId: invitation.householdId,
          userId,
        },
      },
      create: {
        householdId: invitation.householdId,
        userId,
        role: invitation.invitedRole,
        status: MembershipStatus.ACTIVE,
      },
      update: {
        role: invitation.invitedRole,
        status: MembershipStatus.ACTIVE,
      },
    });"""

new = """    if (invitation.revokedAt) {
      throw new BadRequestException('Invitation was revoked');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // The token names a recipient. Without this check ANY signed-in user holding
    // the link could join the household, and — because the upsert below used to
    // rewrite the role — an existing PRIMARY_FILER who opened a CO_FILER
    // invitation was silently demoted.
    if (user.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was issued to a different e-mail address. Sign in with the invited account.',
      );
    }

    // Upsert membership. The role is set on creation only: an existing member
    // keeps the role they already have, so an invitation can never downgrade a
    // primary filer.
    await this.prisma.householdMembership.upsert({
      where: {
        householdId_userId: {
          householdId: invitation.householdId,
          userId,
        },
      },
      create: {
        householdId: invitation.householdId,
        userId,
        role: invitation.invitedRole,
        status: MembershipStatus.ACTIVE,
      },
      update: {
        status: MembershipStatus.ACTIVE,
      },
    });"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

if "ForbiddenException" not in s.split("export class")[0]:
    raise SystemExit("ForbiddenException is not imported — fix the import first")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
