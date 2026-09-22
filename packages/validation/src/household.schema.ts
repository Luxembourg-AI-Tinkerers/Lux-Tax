import { z } from 'zod';
import { HouseholdRole } from '@luxtax/contracts';

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(2, { message: 'Household name must be at least 2 characters' }).max(100),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }).toLowerCase(),
  role: z.nativeEnum(HouseholdRole).default(HouseholdRole.CO_FILER),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16, { message: 'Invalid invitation token format' }),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
