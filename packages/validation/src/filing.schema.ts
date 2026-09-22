import { z } from 'zod';

export const approveReturnSchema = z.object({
  returnVersionId: z.string().uuid(),
});

export const importAssessmentSchema = z.object({
  taxYear: z.number().int().min(2020).max(2030),
  bulletinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bulletin date must be YYYY-MM-DD'),
  assessedTaxableIncome: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  assessedTaxDue: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  notes: z.string().max(1000).optional(),
});

export type ApproveReturnInput = z.infer<typeof approveReturnSchema>;
export type ImportAssessmentInput = z.infer<typeof importAssessmentSchema>;
