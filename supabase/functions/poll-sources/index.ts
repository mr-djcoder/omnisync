// Scheduled poller. For each master source, fetch recent posts and insert new ones.
// Invoked by pg_cron (service-role). No user JWT.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// mirrors packages/shared/src/sourcePost.ts
// (jsr:@omnisync/shared is not published; inline copy kept in sync with the Node-tested original)
type SourcePostType = 'text' | 'image' | 'video';
interface SourcePost {
  external_post_id: string;
  type: SourcePostType;
  text: string;
  media: string[];
  permalink: string | null;
  posted_at: string | null;
}
type FbPost = {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time?: string;
  attachments?: { data?: Array<{ media_type?: string; media?: { source?: string } }> };
};
function parseFacebookPost(post: FbPost): SourcePost {
  const text = post.message ?? '';
  const permalink = post.permalink_url ?? null;
  const posted_at = post.created_time ?? null;
  const videoSrc = post.attachments?.data?.find((a) => a.media_type === 'video')?.media?.source;
  if (videoSrc) {
    return { external_post_id: post.id, type: 'video', text, media: [videoSrc], permalink, posted_at };
  }
  if (post.full_picture) {
    return {
      external_post_id: post.id,
      type: 'image',
      text,
      media: [post.full_picture],
      permalink,
      posted_at,
    };
  }
  return { external_post_id: post.id, type: 'text', text, media: [], permalink, posted_at };
}

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  // master_source joined to its connection (facebook only in v1).
  const { data: masters, error } = await admin
    .from('master_source')
    .select('user_id, connection_id, social_connections!inner(id, provider, external_id, user_id)');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let inserted = 0;
  for (const m of masters ?? []) {
    const conn = (
      m as unknown as {
        social_connections: { id: string; provider: string; external_id: string; user_id: string };
      }
    ).social_connections;
    if (conn.provider !== 'facebook') continue;

    // Decrypt the page token via an RPC (pgp_sym_decrypt server-side).
    const { data: tokenRow } = await admin.rpc('get_connection_token', {
      p_connection_id: conn.id,
      p_enc_key: encKey,
    });
    const token = tokenRow as string | null;
    if (!token) continue;

    // Cursor.
    const { data: state } = await admin
      .from('source_poll_state')
      .select('last_external_post_id')
      .eq('connection_id', conn.id)
      .maybeSingle();
    const lastSeen = (state as { last_external_post_id?: string } | null)?.last_external_post_id;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${conn.external_id}/posts` +
        `?fields=id,message,full_picture,permalink_url,created_time,attachments{media_type,media}&limit=10` +
        `&access_token=${encodeURIComponent(token)}`,
    );
    const json = await res.json();
    const posts: Array<{ id: string }> = json.data ?? [];

    let newest: string | undefined;
    for (const raw of posts) {
      if (lastSeen && raw.id === lastSeen) break; // reached previously seen
      newest = newest ?? raw.id;
      const parsed = parseFacebookPost(raw as never);
      await admin.from('source_posts').upsert(
        {
          user_id: conn.user_id,
          connection_id: conn.id,
          external_post_id: parsed.external_post_id,
          type: parsed.type,
          text: parsed.text,
          media: parsed.media,
          permalink: parsed.permalink,
          posted_at: parsed.posted_at,
        },
        { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true },
      );
      inserted++;
    }

    if (newest) {
      await admin.from('source_poll_state').upsert(
        {
          connection_id: conn.id,
          last_external_post_id: newest,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id' },
      );
    }
  }

  return new Response(JSON.stringify({ inserted }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
