import { z } from 'zod';
import { FactCategory } from '@luxtax/contracts';

export const confirmFactSchema = z.object({
  extractedFactId: z.string().uuid().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  category: z.nativeEnum(FactCategory),
  fieldKey: z.string().min(1).max(100),
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Amount must be a valid currency number with up to 2 decimal places'),
  currency: z.string().length(3).default('EUR'),
  isSharedWithHousehold: z.boolean().default(true),
  isIncludedInReturn: z.boolean().default(true),
  description: z.string().max(500).optional(),
});

export const updateFactSchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Amount must be a valid currency number with up to 2 decimal places').optional(),
  ownerId: z.string().uuid().nullable().optional(),
  category: z.nativeEnum(FactCategory).optional(),
  isSharedWithHousehold: z.boolean().optional(),
  isIncludedInReturn: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

/**
 * Confirming a document's figures one HTTP request each was the slowest step
 * in an otherwise automatic pipeline: a salary certificate carries four, an
 * itemised invoice more. The cap keeps one call bounded and forces a client
 * that somehow sends thousands to page its work instead.
 */
export const confirmFactsBulkSchema = z.object({
  extractedFactIds: z.array(z.string().uuid()).min(1).max(50),
  isSharedWithHousehold: z.boolean().default(true),
  isIncludedInReturn: z.boolean().default(true),
});

export type ConfirmFactInput = z.infer<typeof confirmFactSchema>;
export type ConfirmFactsBulkInput = z.infer<typeof confirmFactsBulkSchema>;
export type UpdateFactInput = z.infer<typeof updateFactSchema>;
