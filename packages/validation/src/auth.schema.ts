import { z } from 'zod';

/**
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
    }),
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }).toLowerCase(),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, { message: 'Refresh token is required' }),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
