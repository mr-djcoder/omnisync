import { z } from 'zod';

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1),
  created_at: z.string().datetime().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
