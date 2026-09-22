import { z } from 'zod';
import { TaxResidence, TaxClass } from '@luxtax/contracts';

export const initWorkspaceSchema = z.object({
  taxYear: z
    .number()
    .int()
    .min(2020, { message: 'Tax year must be 2020 or later' })
    .max(2035, { message: 'Tax year cannot be beyond 2035' }),
  residenceStatus: z.nativeEnum(TaxResidence).default(TaxResidence.RESIDENT),
  taxClass: z.nativeEnum(TaxClass).optional(),
});

export type InitWorkspaceInput = z.infer<typeof initWorkspaceSchema>;
