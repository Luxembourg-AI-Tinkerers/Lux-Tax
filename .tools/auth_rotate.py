import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# login carries the revocation counter
old_login = "    const tokens = await this.generateTokens(user.id, user.email);\n\n    return {\n      user: {\n        id: user.id,\n        email: user.email,\n        firstName: user.profile?.firstName || undefined,\n        lastName: user.profile?.lastName || undefined,\n        isEmailVerified: user.isEmailVerified,\n        createdAt: user.createdAt.toISOString(),\n      },\n      tokens,\n    };\n  }\n\n  async refresh("
new_login = "    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);\n\n    return {\n      user: {\n        id: user.id,\n        email: user.email,\n        firstName: user.profile?.firstName || undefined,\n        lastName: user.profile?.lastName || undefined,\n        isEmailVerified: user.isEmailVerified,\n        createdAt: user.createdAt.toISOString(),\n      },\n      tokens,\n    };\n  }\n\n  async refresh("
assert s.count(old_login) == 1, s.count(old_login)
s = s.replace(old_login, new_login)

# refresh: reuse detection + family rotation
old_refresh = """    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!session || !session.user || !session.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old session (refresh token rotation)
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(session.user.id, session.user.email);"""

new_refresh = """    // Look the token up even when it is revoked: a token presented after its
    // rotation is a replay, and the correct response is to burn the whole family
    // rather than merely rejecting that one request.
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.revokedAt) {
      if (session.familyId) {
        await this.prisma.session.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.auditService.log({
        actorId: session.userId,
        eventType: AuditEventType.USER_LOGGED_OUT,
        entityType: 'Session',
        entityId: session.id,
        description: 'Refresh token replayed after rotation; token family revoked',
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!session.user || !session.user.isActive || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old session (refresh token rotation), staying in the same family.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(
      session.user.id,
      session.user.email,
      session.user.tokenVersion,
      session.familyId ?? undefined,
    );"""

assert s.count(old_refresh) == 1, s.count(old_refresh)
s = s.replace(old_refresh, new_refresh)

# logout: also invalidate access tokens already issued
old_logout = """    await this.auditService.log({
      actorId: userId,
      eventType: AuditEventType.USER_LOGGED_OUT,
      entityType: 'User',
      entityId: userId,
      description: 'User logged out',
    });"""

new_logout = """    // Access tokens are stateless, so the only way to honour a logout immediately
    // is to move the counter they are checked against.
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await this.auditService.log({
      actorId: userId,
      eventType: AuditEventType.USER_LOGGED_OUT,
      entityType: 'User',
      entityId: userId,
      description: 'User logged out',
    });"""

assert s.count(old_logout) == 1, s.count(old_logout)
s = s.replace(old_logout, new_logout)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
