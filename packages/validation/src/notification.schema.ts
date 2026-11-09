import { z } from 'zod';
import { NotificationType } from '@luxtax/contracts';

/**
 * Ordinary notification preferences only. Security alerts (and other
 * non-overridable service notices) are not represented here: they ignore user
 * preferences by design, so muting them is not an option this schema exposes.
 */
export const updateNotificationPreferencesSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    mutedTypes: z.array(z.nativeEnum(NotificationType)).max(11).optional(),
  })
  .superRefine((value, ctx) => {
    // The docstring above is enforced here, not just promised: a security alert
    // must never be silenceable.
    if (value.mutedTypes?.includes(NotificationType.SECURITY_ALERT)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mutedTypes'],
        message: 'Security alerts cannot be muted.',
      });
    }
  });

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
