import io

# --- 1. contracts: the two lifecycle event values ---------------------------
p = r"B:\B\tax-app\packages\contracts\src\enums.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

anchor = "  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',\n"
addition = (
    "  /** The user downloaded a copy of their own data (M10). */\n"
    "  USER_DATA_EXPORTED = 'USER_DATA_EXPORTED',\n"
    "  /** The user erased their account; the identity behind the row is gone (M10). */\n"
    "  USER_ACCOUNT_ERASED = 'USER_ACCOUNT_ERASED',\n"
)
assert t.count(anchor) == 1, "enum anchor"
t = t.replace(anchor, anchor + addition, 1)
io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("contracts: lifecycle events added")

# --- 2. proxy-trust: Fastify's type has no numeric form ---------------------
p2 = r"B:\B\tax-app\apps\api\src\config\proxy-trust.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
nl2 = "\r\n" if "\r\n" in raw2 else "\n"
t2 = raw2.replace("\r\n", "\n")

old_type = """ * - `TRUST_PROXY=<n>` → trust the last `n` hops (Fastify's hop count). This is
 *   the right setting for a known chain of `n` proxies.
"""
new_type = """ * - `TRUST_PROXY=<n>` → trust the last `n` hops. Fastify has no numeric form,
 *   so this compiles to a hop predicate with proxy-addr's semantics
 *   (`hop < n`), which is the right setting for a known chain of `n` proxies.
"""
assert t2.count(old_type) == 1, "doc comment"
t2 = t2.replace(old_type, new_type, 1)

old_sig = """export type TrustProxySetting = boolean | number | string[];
"""
new_sig = """export type TrustProxyFunction = (address: string, hop: number) => boolean;

export type TrustProxySetting = boolean | string[] | TrustProxyFunction;
"""
assert t2.count(old_sig) == 1, "type alias"
t2 = t2.replace(old_sig, new_sig, 1)

old_num = """  // A hop count: trust the last N proxies. 1 is the usual single-LB setup.
  if (/^\\d+$/.test(value)) {
    const hops = Number(value);
    return hops > 0 ? hops : false;
  }
"""
new_num = """  // A hop count: trust the last N proxies. 1 is the usual single-LB setup.
  // Fastify accepts no numeric value, so this becomes the equivalent predicate.
  if (/^\\d+$/.test(value)) {
    const hops = Number(value);
    if (hops <= 0) return false;
    return (_address: string, hop: number) => hop < hops;
  }
"""
assert t2.count(old_num) == 1, "hop count branch"
t2 = t2.replace(old_num, new_num, 1)
io.open(p2, "w", encoding="utf-8", newline=nl2).write(t2)
print("proxy-trust: hop count compiled to a predicate")

# --- 3. facts.service: guard the null document id --------------------------
p3 = r"B:\B\tax-app\apps\api\src\modules\facts\facts.service.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
nl3 = "\r\n" if "\r\n" in raw3 else "\n"
t3 = raw3.replace("\r\n", "\n")

old_facts = """      const remaining = await this.prisma.extractedFact.count({
        where: { documentId: sourceDocumentId, isConfirmed: false },
      });
      if (remaining === 0 && sourceDocumentId) {
        await this.prisma.documentExtraction.updateMany({
          where: { documentId: sourceDocumentId },
          data: { extractedText: null, rawJson: Prisma.JsonNull },
        });
      }
"""
new_facts = """      if (sourceDocumentId) {
        const remaining = await this.prisma.extractedFact.count({
          where: { documentId: sourceDocumentId, isConfirmed: false },
        });
        if (remaining === 0) {
          await this.prisma.documentExtraction.updateMany({
            where: { documentId: sourceDocumentId },
            data: { extractedText: null, rawJson: Prisma.JsonNull },
          });
        }
      }
"""
assert t3.count(old_facts) == 1, "facts block"
t3 = t3.replace(old_facts, new_facts, 1)
io.open(p3, "w", encoding="utf-8", newline=nl3).write(t3)
print("facts.service: null-safe")

# --- 4. users.service: fileName, and invitation filter on revokedAt --------
p4 = r"B:\B\tax-app\apps\api\src\modules\users\users.service.ts"
raw4 = io.open(p4, encoding="utf-8", newline="").read()
nl4 = "\r\n" if "\r\n" in raw4 else "\n"
t4 = raw4.replace("\r\n", "\n")

assert t4.count("          filename: true,\n") == 1
t4 = t4.replace("          filename: true,\n", "          fileName: true,\n", 1)

old_inv = """      this.prisma.householdInvitation.deleteMany({
        where: { invitedById: userId, status: 'PENDING' },
      }),
"""
new_inv = """      // Pending invitations this user sent die with the account: the address is
      // no longer reachable and the inviter no longer exists.
      this.prisma.householdInvitation.deleteMany({
        where: { invitedById: userId, acceptedAt: null, revokedAt: null },
      }),
"""
assert t4.count(old_inv) == 1, "invitation filter"
t4 = t4.replace(old_inv, new_inv, 1)
io.open(p4, "w", encoding="utf-8", newline=nl4).write(t4)
print("users.service: select and invitation filter corrected")
