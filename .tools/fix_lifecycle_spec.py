import io

p = r"B:\B\tax-app\apps\api\test\account-lifecycle.e2e-spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

start = t.find("  it('refuses to erase an owner whose household still has members'")
end = t.find("  it('erasure anonymises the identity")
assert start != -1 and end > start, "section bounds"

replacement = '''  it('refuses to erase an owner whose household still has an active member', async () => {
    const second = await register(EMAILS[1]);

    const exported = JSON.parse(
      (await app.inject({ method: 'GET', url: '/api/users/me/export', headers: auth() })).body,
    );
    const householdId = exported.memberships[0].householdId as string;

    const invite = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/invitations`,
      headers: auth(),
      payload: { email: EMAILS[1], role: 'CO_FILER' },
    });
    expect(invite.statusCode).toBe(201);
    const invitationToken = JSON.parse(invite.body).invitationToken as string;

    // Acceptance requires a proven address.
    expect(await verifyEmailFor(app, EMAILS[1])).toBeLessThan(300);
    const accept = await app.inject({
      method: 'POST',
      url: '/api/households/invitations/accept',
      headers: { authorization: `Bearer ${second.token}` },
      payload: { token: invitationToken },
    });
    expect(accept.statusCode).toBe(201);

    // Erasing now would leave the co-filer with a household they cannot
    // administer and a return they cannot approve: it is an ownership transfer.
    const refused = await app.inject({ method: 'DELETE', url: '/api/users/me', headers: auth() });
    expect(refused.statusCode).toBe(409);
    expect(refused.body).toContain('Transfer ownership');

    // The account is untouched by a refused erasure.
    const stillThere = await prisma.user.findUnique({ where: { id: userId } });
    expect(stillThere?.email).toBe(EMAILS[0]);
    expect(stillThere?.isActive).toBe(true);

    // Once the other member is gone, the same request succeeds.
    await prisma.householdMembership.deleteMany({
      where: { householdId, userId: { not: userId } },
    });
    const allowed = await app.inject({ method: 'DELETE', url: '/api/users/me', headers: auth() });
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).erased).toBe(true);
  });

'''

t = t[:start] + replacement + t[end:]

# Add the verification helper import.
old_import = "import { purgeAuditEvents } from './support/audit-purge';\n"
new_import = old_import + "import { verifyEmailFor } from './support/verify-email';\n"
assert t.count(old_import) == 1, "import anchor"
t = t.replace(old_import, new_import, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("account-lifecycle spec: refusal path rewritten")
