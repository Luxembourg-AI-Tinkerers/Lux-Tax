import { z } from 'zod';

export const updateFreelanceProfileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(200),
  activityType: z.string().min(1, 'Activity type is required').max(200),
  taxIdOrVat: z.string().max(50).optional().nullable(),
  accountingType: z.enum(['CASH_BASIS', 'ACCRUAL']).default('CASH_BASIS'),
});

export type UpdateFreelanceProfileInput = z.infer<typeof updateFreelanceProfileSchema>;
