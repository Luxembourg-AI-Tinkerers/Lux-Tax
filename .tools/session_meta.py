import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# 1. generateTokens accepts the request metadata and stores it.
old_sig = """  private async generateTokens(
    userId: string,
    email: string,
    tokenVersion = 0,
    familyId?: string,
  ) {
"""
new_sig = """  private async generateTokens(
    userId: string,
    email: string,
    tokenVersion = 0,
    familyId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
"""
assert t.count(old_sig) == 1, "generateTokens signature"
t = t.replace(old_sig, new_sig, 1)

old_create = """    const family = familyId ?? crypto.randomBytes(16).toString('hex');
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        familyId: family,
      },
    });
"""
new_create = """    const family = familyId ?? crypto.randomBytes(16).toString('hex');

    // M10: the session list is the only place a user can see where they are
    // signed in. The columns existed but were never written, so there was
    // nothing to show and nothing to investigate after a compromise.
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        familyId: family,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    // Keep the table from growing without bound: an expired session can no
    // longer authenticate anything, so it is deleted as the next one is issued.
    await this.prisma.session.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
"""
assert t.count(old_create) == 1, "session create"
t = t.replace(old_create, new_create, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("auth.service.ts: session metadata + pruning")
