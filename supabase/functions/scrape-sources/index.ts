import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Map one Apify FB post item to our source_posts shape.
function mapItem(it: Record<string, unknown>): {
  external_post_id: string;
  type: string;
  text: string;
  media: string[];
} | null {
  const id = (it.postId ?? it.url) as string | undefined;
  if (!id) return null;
  const text = (it.text ?? '') as string;
  const rawMedia = Array.isArray(it.media) ? (it.media as Array<Record<string, unknown>>) : [];
  const media: string[] = [];
  let hasVideo = false;
  for (const m of rawMedia) {
    if (m.__typename === 'Video') hasVideo = true;
    const u = (m.url ?? m.thumbnail ?? m.image) as string | undefined;
    if (u) media.push(u);
  }
  const type = hasVideo ? 'video' : media.length ? 'image' : 'text';
  return { external_post_id: String(id), type, text, media };
}

type ScrapeResult = { fetched: number; inserted: number; error?: string };

async function scrapeOne(
  admin: ReturnType<typeof createClient>,
  conn: {
    id: string;
    user_id: string;
    external_id: string;
  },
): Promise<ScrapeResult> {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) return { fetched: 0, inserted: 0, error: 'APIFY_TOKEN not set' };
  const pageUrl = `https://www.facebook.com/${conn.external_id}/`;
  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrls: [{ url: pageUrl }], resultsLimit: 10 }),
      },
    );
  } catch (e) {
    return { fetched: 0, inserted: 0, error: `apify fetch failed: ${String(e)}` };
  }
  if (!res.ok) {
    return {
      fetched: 0,
      inserted: 0,
      error: `apify ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  const items = (await res.json()) as Array<Record<string, unknown>>;
  const list = Array.isArray(items) ? items : [];
  let inserted = 0;
  for (const raw of list) {
    const p = mapItem(raw);
    if (!p) continue;
    const { error, count } = await admin.from('source_posts').upsert(
      {
        user_id: conn.user_id,
        connection_id: conn.id,
        external_post_id: p.external_post_id,
        type: p.type,
        text: p.text,
        media: p.media,
      },
      { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true, count: 'exact' },
    );
    if (error) return { fetched: list.length, inserted, error: `db: ${error.message}` };
    inserted += count ?? 0;
  }
  return { fetched: list.length, inserted };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (body.auto === true) {
    // cron: all auto scrape sources
    const { data } = await admin
      .from('social_connections')
      .select('id, user_id, external_id')
      .eq('connector_type', 'scrape')
      .eq('sync_mode', 'auto')
      .eq('status', 'active');
    let inserted = 0;
    let fetched = 0;
    for (const c of data ?? []) {
      const r = await scrapeOne(admin, c as never);
      inserted += r.inserted;
      fetched += r.fetched;
    }
    return new Response(JSON.stringify({ scraped: (data ?? []).length, fetched, inserted }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // manual: requires the user's JWT + ownership of the connection
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
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: cors,
    });
  const { connection_id } = body;
  const { data: conn } = await admin
    .from('social_connections')
    .select('id, user_id, external_id, connector_type')
    .eq('id', connection_id)
    .maybeSingle();
  if (!conn || conn.user_id !== u.user.id || conn.connector_type !== 'scrape') {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });
  }
  const result = await scrapeOne(admin, conn as never);
  return new Response(JSON.stringify({ ok: !result.error, ...result }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
