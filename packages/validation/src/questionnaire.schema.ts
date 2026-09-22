import { z } from 'zod';

export const questionnaireSchema = z.object({
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'PACS', 'DIVORCED', 'WIDOWED']),
  hasEmploymentIncome: z.boolean(),
  hasPensionIncome: z.boolean(),
  hasPrimaryResidenceMortgage: z.boolean(),
  mortgageOccupancyYear: z.number().int().min(1950).max(2030).optional(),
  hasLifeInsuranceOrPensionPlan: z.boolean(),
  hasDonations: z.boolean(),
  childrenCount: z.number().int().min(0).max(20).default(0),
  notes: z.string().max(1000).optional(),
});

export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;
