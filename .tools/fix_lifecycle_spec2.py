import io

p = r"B:\B\tax-app\apps\api\test\account-lifecycle.e2e-spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old_lookup = """    const users = await prisma.user.findMany({
      where: { email: { in: EMAILS } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return;
    await purgeAuditEvents(prisma, userIds);
"""
new_lookup = """    // An erased account keeps no address, so match it by the tombstone pattern
    // as well; otherwise its rows survive into the next run and every count
    // assertion drifts.
    const users = await prisma.user.findMany({
      where: {
        OR: [{ email: { in: EMAILS } }, { email: { startsWith: 'deleted-' } }],
      },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) return;
    await purgeAuditEvents(prisma, userIds);
    // Rejected logins for addresses that never had an account carry no actor, so
    // they are not covered by the purge above.
    await purgeAuditEventsByEmail(prisma, [UNKNOWN_ADDRESS]);
"""
assert t.count(old_lookup) == 1, "cleanup lookup"
t = t.replace(old_lookup, new_lookup, 1)

old_const = "  const EMAILS = ['lifecycle.one@e2e.lu', 'lifecycle.two@e2e.lu'];\n"
new_const = (
    "  const EMAILS = ['lifecycle.one@e2e.lu', 'lifecycle.two@e2e.lu'];\n"
    "  const UNKNOWN_ADDRESS = 'nobody-at-all@e2e.lu';\n"
)
assert t.count(old_const) == 1, "emails const"
t = t.replace(old_const, new_const, 1)

t = t.replace(
    "    const unknown = 'nobody-at-all@e2e.lu';\n",
    "    const unknown = UNKNOWN_ADDRESS;\n",
    1,
)

old_assert = """    const profile = await prisma.personProfile.findUnique({ where: { userId: userId! } });
    expect(profile?.firstName ?? null).toBeNull();
    expect(profile?.lastName ?? null).toBeNull();
"""
new_assert = """    const profile = await prisma.personProfile.findUnique({ where: { userId: userId! } });
    expect(profile?.firstName ?? null).toBeNull();
    expect(profile?.lastName ?? null).toBeNull();

    // No membership survives, so the account has no access anywhere.
    expect(await prisma.householdMembership.count({ where: { userId: userId! } })).toBe(0);

    // The household itself is retained — an append-only audit trail rejects the
    // cascade — but its personal name is gone.
    const retained = await prisma.household.findMany({
      where: { name: 'Deleted household' },
      select: { id: true },
    });
    expect(retained.length).toBeGreaterThanOrEqual(1);
"""
assert t.count(old_assert) == 1, "profile assertions"
t = t.replace(old_assert, new_assert, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("spec updated")
