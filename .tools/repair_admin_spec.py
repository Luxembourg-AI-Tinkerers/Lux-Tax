import io

p = r"B:\B\tax-app\apps\api\test\admin-governance.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

start = s.index("    // API-1: /api/admin/** is gated by the operator-managed ADMIN_EMAILS allowlist,")
end = s.index("  afterAll(async () => {", start)

replacement = """    // API-1: /api/admin/** is gated by the operator-managed ADMIN_EMAILS allowlist,
    // so the registered administrator must be allowlisted before the first admin call.
    process.env.ADMIN_EMAILS = uniqueEmail;

    // Platform administration now also requires a verified address: the allowlist
    // matches an e-mail, so the account must prove it owns that address.
    await verifyEmailFor(app, uniqueEmail);

    // A second, ordinary taxpayer: registered, authenticated, no platform grant.
    const ordinaryEmail = `user-${Date.now()}@e2e.lu`;
    const ordinaryRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: ordinaryEmail,
        password: 'Password123!',
        firstName: 'Ordinary',
        lastName: 'Taxpayer',
      },
    });

    expect(ordinaryRes.statusCode).toBe(201);
    const ordinaryBody = JSON.parse(ordinaryRes.payload);
    ordinaryToken = ordinaryBody.tokens.accessToken;
    ordinaryUserId = ordinaryBody.user.id;

    // Verified too, so the 403 below is about the allowlist and not about the
    // missing proof of address.
    await verifyEmailFor(app, ordinaryEmail);
  });

"""

s = s[:start] + replacement + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("rewritten")
