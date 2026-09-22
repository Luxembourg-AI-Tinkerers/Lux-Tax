import { z } from 'zod';

export const createModelSchema = z.object({
  displayName: z.string().min(2).max(100),
  providerType: z.enum(['LOCAL', 'PRIVATE_CLOUD', 'HOSTED', 'CUSTOM_PUBLIC']),
  modelIdentifier: z.string().min(1).max(100),
  capabilities: z.array(z.enum(['TEXT', 'VISION', 'EMBEDDING', 'RERANKING'])).min(1),
  permittedDataClass: z.enum(['PUBLIC', 'SYNTHETIC', 'REDACTED_CUSTOMER', 'CUSTOMER_DOCUMENT']),
  hostingRegion: z.string().min(2).max(64),
  endpointUrl: z.string().url().optional().or(z.literal('')),
  apiKey: z.string().optional(),
  status: z.enum(['ACTIVE', 'CANARY', 'DISABLED']).optional().default('ACTIVE'),
});

export type CreateModelInput = z.infer<typeof createModelSchema>;

export const updateModelSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  providerType: z.enum(['LOCAL', 'PRIVATE_CLOUD', 'HOSTED', 'CUSTOM_PUBLIC']).optional(),
  modelIdentifier: z.string().min(1).max(100).optional(),
  capabilities: z.array(z.enum(['TEXT', 'VISION', 'EMBEDDING', 'RERANKING'])).min(1).optional(),
  permittedDataClass: z.enum(['PUBLIC', 'SYNTHETIC', 'REDACTED_CUSTOMER', 'CUSTOMER_DOCUMENT']).optional(),
  hostingRegion: z.string().min(2).max(64).optional(),
  endpointUrl: z.string().url().optional().or(z.literal('')),
  apiKey: z.string().optional(),
  status: z.enum(['ACTIVE', 'CANARY', 'DISABLED']).optional(),
  healthy: z.boolean().optional(),
});

export type UpdateModelInput = z.infer<typeof updateModelSchema>;

export const testModelConnectionSchema = z.object({
  modelId: z.string().optional(),
  endpointUrl: z.string().url().optional().or(z.literal('')),
  modelIdentifier: z.string().optional(),
  apiKey: z.string().optional(),
  prompt: z.string().optional(),
});

export type TestModelConnectionInput = z.infer<typeof testModelConnectionSchema>;

export const updateModelRouteSchema = z.object({
  primaryModelId: z.string().min(1),
  fallbackModelIds: z.array(z.string()).default([]),
  promptVersion: z.string().optional(),
  outputSchemaVersion: z.string().optional(),
  timeoutMs: z.number().int().min(500).max(60000).optional(),
  maxDataClass: z.string().optional(),
  activeRolloutPercentage: z.number().int().min(0).max(100).optional(),
});

export type UpdateModelRouteInput = z.infer<typeof updateModelRouteSchema>;
