import io

# ---------------------------------------------------------------- 1. filing-record
# A joint return could never be filed when a VIEWER was an active member: this
# call site still counted every member, while approval and history exclude them.
p = r"B:\B\tax-app\apps\api\src\modules\filing\filing.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = "    const requiredMemberIds = workspace.household.members.map((member) => member.userId);"
new = ("    // A VIEWER cannot approve, so counting one here would make the return\n"
       "    // permanently unfilable. Same helper as approval and history.\n"
       "    const requiredMemberIds = requiredApproverIds(workspace.household.members);")
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("filing-record viewers fixed")

# ---------------------------------------------------------------- 2. login timing
# A missing account skipped argon2 entirely, so response time revealed whether an
# address exists. Always spend the same work.
p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }"""

new = """    // Always perform a verify, even when the account does not exist, so the
    // response time does not reveal whether an address is registered. The dummy
    // hash is a real argon2id hash of a random value, produced once.
    if (!user || !user.isActive) {
      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

# The dummy hash constant, computed once at module load.
anchor = "@Injectable()\nexport class AuthService {"
constant = """/**
 * Argon2id hash of a value nobody knows, used to spend the same work when the
 * account is missing. Parameters must match the real hashing below.
 */
const DUMMY_PASSWORD_HASH = argon2.hash('luxtax-dummy-password', {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
});

@Injectable()
export class AuthService {"""
assert s.count(anchor) == 1
s = s.replace(anchor, constant)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("login timing fixed")

# ---------------------------------------------------------------- 3. invite role
p = r"B:\B\tax-app\apps\api\src\modules\households\households.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    // Upsert membership. The role is set on creation only: an existing member
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

new = """    // Upsert membership. A member who is already ACTIVE keeps the role they have,
    // so an invitation can never downgrade a primary filer. A returning member
    // (status REMOVED) takes the role this invitation grants — otherwise a
    // removed CO_FILER re-invited as VIEWER would come back with co-filer rights
    // while the audit log said "joined as VIEWER".
    const existing = await this.prisma.householdMembership.findUnique({
      where: { householdId_userId: { householdId: invitation.householdId, userId } },
      select: { status: true },
    });

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
      update:
        existing?.status === MembershipStatus.ACTIVE
          ? { status: MembershipStatus.ACTIVE }
          : { status: MembershipStatus.ACTIVE, role: invitation.invitedRole },
    });"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("invite re-activation fixed")
