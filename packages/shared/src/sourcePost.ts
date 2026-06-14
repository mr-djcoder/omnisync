import { z } from 'zod';

export const SourcePostTypeSchema = z.enum(['text', 'image', 'video']);
export type SourcePostType = z.infer<typeof SourcePostTypeSchema>;

export const SourcePostSchema = z.object({
  external_post_id: z.string().min(1),
  type: SourcePostTypeSchema,
  text: z.string(),
  media: z.array(z.string()),
});
export type SourcePost = z.infer<typeof SourcePostSchema>;

// Minimal shape of a Facebook Graph post we care about.
type FbPost = {
  id: string;
  message?: string;
  full_picture?: string;
  attachments?: { data?: Array<{ media_type?: string; media?: { source?: string } }> };
};

export function parseFacebookPost(post: FbPost): SourcePost {
  const text = post.message ?? '';
  const videoSrc = post.attachments?.data?.find((a) => a.media_type === 'video')?.media?.source;
  if (videoSrc) {
    return { external_post_id: post.id, type: 'video', text, media: [videoSrc] };
  }
  if (post.full_picture) {
    return { external_post_id: post.id, type: 'image', text, media: [post.full_picture] };
  }
  return { external_post_id: post.id, type: 'text', text, media: [] };
}
