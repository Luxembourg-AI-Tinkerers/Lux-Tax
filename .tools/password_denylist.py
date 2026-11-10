import io

p = r"B:\B\tax-app\packages\validation\src\auth.schema.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """export const registerSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }).toLowerCase(),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long' })
    .max(128, { message: 'Password must be under 128 characters' })
    .regex(/[A-Za-z]/, { message: 'Password must contain at least one letter' })
    .regex(/[0-9]/, { message: 'Password must contain at least one number' }),"""

new = """/**
 * Passwords that satisfy the structural rules but are still the first thing
 * anybody tries. A full breach-list check needs a data source; this closes the
 * specific hole the review found (`password1` was accepted) without inventing a
 * length rule that a user with no reset flow could be locked out by.
 */
const COMMON_PASSWORDS = new Set([
  'password1',
  'password12',
  'password123',
  'passw0rd1',
  '12345678',
  '123456789',
  'qwerty12',
  'qwerty123',
  'letmein1',
  'welcome1',
  'iloveyou1',
  'admin123',
]);

export const registerSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }).toLowerCase(),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long' })
    .max(128, { message: 'Password must be under 128 characters' })
    .regex(/[A-Za-z]/, { message: 'Password must contain at least one letter' })
    .regex(/[0-9]/, { message: 'Password must contain at least one number' })
    .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
      message: 'This password is too common; choose another',
    }),"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("denylist added")
