import { z } from 'zod';

export const PROVIDERS = ['facebook', 'instagram', 'tiktok', 'snapchat'] as const;
export const ProviderSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof ProviderSchema>;

export const ConnectorTypeSchema = z.enum(['owned_api', 'external_api', 'scrape']);
export const ConnectionStatusSchema = z.enum(['active', 'revoked', 'error']);

export const ConnectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: ProviderSchema,
  external_id: z.string().min(1),
  handle: z.string().nullable().optional(),
  scopes: z.array(z.string()).default([]),
  is_owned: z.boolean().default(true),
  connector_type: ConnectorTypeSchema.default('owned_api'),
  status: ConnectionStatusSchema.default('active'),
});

export type Connection = z.infer<typeof ConnectionSchema>;
