import { z } from 'zod';
import { HouseholdRole } from '@luxtax/contracts';

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(2, { message: 'Household name must be at least 2 characters' }).max(100),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }).toLowerCase(),
  // An invitation may only grant a working role: PRIMARY_FILER belongs to the
  // household creator and must not be mintable by an existing member (a VIEWER
  // could otherwise create a filer account and write through it).
  role: z
    .nativeEnum(HouseholdRole)
    .refine(
      (role) => role === HouseholdRole.CO_FILER || role === HouseholdRole.VIEWER,
      { message: 'Invitations may only grant the CO_FILER or VIEWER role' },
    )
    .default(HouseholdRole.CO_FILER),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16, { message: 'Invalid invitation token format' }),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
