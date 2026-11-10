import io

# --- users.service.ts: erasure keeps the records the audit trail points at ---
p = r"B:\B\tax-app\apps\api\src\modules\users\users.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old_doc = """   * Otherwise the identity is anonymised in place (so the audit trail keeps
   * pointing at a row that no longer identifies anyone), credentials are
   * destroyed, sessions and push registrations are deleted, and a household this
   * user was alone in is deleted with its workspaces.
   */
"""
new_doc = """   * Otherwise the identity is anonymised in place (so the audit trail keeps
   * pointing at a row that no longer identifies anyone), credentials are
   * destroyed, sessions and push registrations are deleted, and a household this
   * user was alone in is renamed so the name does not outlive the account.
   *
   * The household and its workspaces are *kept*. That is not an oversight: the
   * append-only trigger on `audit_events` rejects the UPDATE that a cascade would
   * need to null `householdId`, so a household that has any audit history cannot
   * be deleted at all (the same migration documents this). The financial record
   * and the trail behind it are therefore retained, anonymous, which is also what
   * tax-record retention requires.
   */
"""
assert t.count(old_doc) == 1, "doc comment"
t = t.replace(old_doc, new_doc, 1)

old_tx = """    const soleHouseholdIds = user.memberships
      .filter(
        (membership) =>
          membership.household.members.filter((member) => member.userId !== userId).length === 0,
      )
      .map((membership) => membership.householdId);

    const anonymisedEmail = `deleted-${user.id}@deleted.invalid`;
"""
new_tx = """    const soleHouseholdIds = user.memberships
      .filter(
        (membership) =>
          membership.household.members.filter((member) => member.userId !== userId).length === 0,
      )
      .map((membership) => membership.householdId);

    const anonymisedEmail = `deleted-${user.id}@deleted.invalid`;
"""
assert t.count(old_tx) == 1, "sole household block"
t = t.replace(old_tx, new_tx, 1)

old_delete = """      // A household this user was alone in has no other owner to preserve.
      this.prisma.householdMembership.deleteMany({ where: { userId } }),
      this.prisma.household.deleteMany({
        where: { id: { in: soleHouseholdIds }, createdById: userId },
      }),
    ]);
"""
new_delete = """      this.prisma.householdMembership.deleteMany({ where: { userId } }),
      // A household cannot be deleted once it has audit history (the append-only
      // trigger rejects the cascade's UPDATE). Its name, however, is personal
      // data, so a household this user was alone in is renamed.
      this.prisma.household.updateMany({
        where: { id: { in: soleHouseholdIds }, createdById: userId },
        data: { name: 'Deleted household' },
      }),
    ]);
"""
assert t.count(old_delete) == 1, "delete block"
t = t.replace(old_delete, new_delete, 1)

old_return = """    return {
      erased: true,
      anonymisedEmail,
      householdsDeleted: soleHouseholdIds.length,
    };
"""
new_return = """    return {
      erased: true,
      anonymisedEmail,
      householdsAnonymised: soleHouseholdIds.length,
      // Stated explicitly so a caller is not surprised that the financial record
      // survives: the audit trail behind it is append-only by design.
      recordsRetained: true,
    };
"""
assert t.count(old_return) == 1, "return block"
t = t.replace(old_return, new_return, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("users.service: erasure retains the household, renames it")
