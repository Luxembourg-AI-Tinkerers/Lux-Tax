import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """/**
 * Argon2id hash of a value nobody knows, used to spend the same work when the
 * account is missing. Parameters must match the real hashing below.
 */
const DUMMY_PASSWORD_HASH = argon2.hash('luxtax-dummy-password', {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
});"""

new = """/**
 * Argon2id hash of a value nobody knows, used to spend the same work when the
 * account is missing. Computed once, lazily, with the same parameters as a real
 * password so the timing of a failed login does not depend on whether the
 * address exists.
 */
let dummyPasswordHash: string | null = null;

async function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash) {
    dummyPasswordHash = await argon2.hash('luxtax-dummy-password', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
    });
  }
  return dummyPasswordHash;
}"""

assert s.count(old) == 1
s = s.replace(old, new)

s = s.replace(
    "      await argon2.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);",
    "      await argon2.verify(await getDummyPasswordHash(), dto.password).catch(() => false);",
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
