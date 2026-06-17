import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function isVideoUrl(u: string): boolean {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(u);
}

// Append the source permalink to the end of the caption (skip if already there).
function appendSourceUrl(text: string, url: string): string {
  if (!url || text.includes(url)) return text;
  return text.trim().length > 0 ? `${text}\n\n${url}` : url;
}

type FbResult = { ok: boolean; id: string | null; error?: string };

async function fbPost(url: string, body: Record<string, unknown>): Promise<FbResult> {
  const res = await fetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const id = (j.post_id ?? j.id) as string | undefined;
  if (res.ok && id) return { ok: true, id };
  return { ok: false, id: null, error: JSON.stringify(j.error ?? j) };
}

// Publishes to a Facebook Page. Three shapes:
//  - No media + source link  → link-preview card to the original post.
//  - Media (own/user)         → native photo/video post; source link appended to caption.
//  - No media, no source link → plain text post.
async function publishToFacebook(
  pageId: string,
  token: string,
  text: string,
  media: string[],
  sourceUrl?: string,
): Promise<FbResult> {
  try {
    const videos = media.filter(isVideoUrl);
    const images = media.filter((m) => !isVideoUrl(m));

    // No media: prefer a rich link card to the source, else plain text.
    if (media.length === 0) {
      if (sourceUrl) {
        return await fbPost(`${GRAPH}/${pageId}/feed`, {
          message: text,
          link: sourceUrl,
          access_token: token,
        });
      }
      return await fbPost(`${GRAPH}/${pageId}/feed`, { message: text, access_token: token });
    }

    // Media present: native post. Keep attribution by appending the source link.
    const caption = sourceUrl ? appendSourceUrl(text, sourceUrl) : text;

    if (videos.length > 0) {
      return await fbPost(`${GRAPH}/${pageId}/videos`, {
        file_url: videos[0],
        description: caption,
        access_token: token,
      });
    }
    if (images.length === 1) {
      return await fbPost(`${GRAPH}/${pageId}/photos`, {
        url: images[0],
        message: caption,
        access_token: token,
      });
    }
    const attached: Array<{ media_fbid: string }> = [];
    for (const img of images) {
      const up = await fbPost(`${GRAPH}/${pageId}/photos`, {
        url: img,
        published: false,
        access_token: token,
      });
      if (!up.ok || !up.id) return up;
      attached.push({ media_fbid: up.id });
    }
    return await fbPost(`${GRAPH}/${pageId}/feed`, {
      message: caption,
      attached_media: attached,
      access_token: token,
    });
  } catch (e) {
    return { ok: false, id: null, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: auth } },
    },
  );
  const { data: u } = await userClient.auth.getUser();
  if (!u.user)
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const { draft_id } = await req.json().catch(() => ({}));
  if (!draft_id)
    return new Response(JSON.stringify({ error: 'missing draft_id' }), {
      status: 400,
      headers: cors,
    });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  // Ownership check.
  const { data: draft } = await admin
    .from('drafts')
    .select('id, user_id, origin, source_post_id')
    .eq('id', draft_id)
    .maybeSingle();
  if (!draft || draft.user_id !== u.user.id)
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

  // For remixes, share the original post's link (preserves the source). Only
  // used when the target has no user-added media.
  let sourceUrl: string | undefined;
  if (draft.origin === 'remix' && draft.source_post_id) {
    const { data: src } = await admin
      .from('source_posts')
      .select('permalink')
      .eq('id', draft.source_post_id)
      .maybeSingle();
    sourceUrl = (src?.permalink as string | null) ?? undefined;
  }

  // Decrypt targets (user-context RPC + server key).
  const { data: targets } = await userClient.rpc('get_draft_targets', {
    p_draft_id: draft_id,
    p_enc_key: encKey,
  });

  const results: Array<{ connection_id: string; status: string; error?: string }> = [];
  for (const t of (targets ?? []) as Array<{
    connection_id: string;
    text: string;
    media: string[] | null;
  }>) {
    const { data: conn } = await admin
      .from('social_connections')
      .select('provider, external_id, handle')
      .eq('id', t.connection_id)
      .maybeSingle();
    let status = 'failed';
    let externalId: string | null = null;
    let error: string | undefined;
    if (conn?.provider === 'facebook') {
      const { data: token } = await admin.rpc('get_connection_token', {
        p_connection_id: t.connection_id,
        p_enc_key: encKey,
      });
      if (!token) {
        error = 'No access token for this Page.';
      } else {
        const r = await publishToFacebook(conn.external_id, token, t.text, t.media ?? [], sourceUrl);
        if (r.ok) {
          status = 'success';
          externalId = r.id;
        } else {
          error = r.error;
        }
      }
    } else {
      error = 'Publishing not supported for this channel yet.';
    }
    // Store a self-contained snapshot for History: text + platform + date.
    // No media is persisted here by design.
    await admin.from('publications').insert({
      user_id: u.user.id,
      draft_id,
      connection_id: t.connection_id,
      external_post_id: externalId,
      status,
      text: t.text,
      provider: conn?.provider ?? null,
      handle: (conn as { handle?: string | null } | null)?.handle ?? null,
    });
    results.push({ connection_id: t.connection_id, status, error });
  }

  await admin.from('drafts').update({ status: 'published' }).eq('id', draft_id);

  return new Response(JSON.stringify({ results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
