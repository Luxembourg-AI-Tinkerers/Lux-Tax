import io
p = "apps/api/src/modules/freelance/freelance.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """    // For any household member who doesn't yet have a profile, ensure a record exists
    for (const member of workspace.household.members) {
      const existing = profiles.find((p) => p.ownerId === member.userId);
      if (!existing) {"""
new = """    // Only members who actually run an independent activity get a profile.
    // Creating one for every household member misrepresented pure employees as
    // freelancers and polluted the AEP / CII evidence trail.
    const independentOwnerIds = new Set(
      (
        await this.prisma.confirmedFact.findMany({
          where: {
            workspaceId,
            category: { in: ['FREELANCE_INCOME', 'BUSINESS_EXPENSE'] },
          },
          select: { ownerId: true },
        })
      )
        .map((f) => f.ownerId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const member of workspace.household.members) {
      const existing = profiles.find((p) => p.ownerId === member.userId);
      if (!existing && independentOwnerIds.has(member.userId)) {"""
assert s.count(old) == 1, s.count(old)
out = s.replace(old, new).replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("patched")
