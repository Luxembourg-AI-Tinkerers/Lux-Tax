import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

anchor = "let dummyPasswordHash: string | null = null;"
guard = '''/**
 * Codes already accepted, per user, so a code cannot be replayed inside its
 * ±1-step window. In-process only: a multi-replica deployment needs this in a
 * shared store, which is the same caveat the rate limiter carries.
 */
const usedTotpCodes = new Map<string, number>();
const TOTP_REPLAY_WINDOW_MS = 90_000;

function claimTotpCode(userId: string, code: string, now = Date.now()): boolean {
  for (const [key, seenAt] of usedTotpCodes) {
    if (now - seenAt > TOTP_REPLAY_WINDOW_MS) usedTotpCodes.delete(key);
  }
  const key = `${userId}:${code}`;
  if (usedTotpCodes.has(key)) return false;
  usedTotpCodes.set(key, now);
  return true;
}

let dummyPasswordHash: string | null = null;'''

assert s.count(anchor) == 1
s = s.replace(anchor, guard)

old = """    if (sealedSecret && /^\\d{6}$/.test(candidate)) {
      try {
        if (verifyTotp(openSecret(sealedSecret), candidate, Date.now())) return true;
      } catch {
        // A corrupt seal must not authenticate anybody; fall through to recovery.
      }
    }"""

new = """    if (sealedSecret && /^\\d{6}$/.test(candidate)) {
      try {
        if (
          verifyTotp(openSecret(sealedSecret), candidate, Date.now()) &&
          claimTotpCode(userId, candidate)
        ) {
          return true;
        }
      } catch {
        // A corrupt seal must not authenticate anybody; fall through to recovery.
      }
    }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("totp replay guard added")
