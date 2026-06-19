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
  permalink: string | null;
  posted_at: string | null;
} | null {
  const id = (it.postId ?? it.url) as string | undefined;
  if (!id) return null;
  const text = (it.text ?? '') as string;
  // Original post URL for link-share remixes (discarded before this).
  const permalink =
    ((it.url ?? it.topLevelUrl ?? it.postUrl ?? it.facebookUrl) as string | undefined) ?? null;
  // Original publish time: Apify gives an ISO `time` and/or a unix `timestamp`.
  let posted_at: string | null = null;
  if (typeof it.time === 'string') posted_at = it.time;
  else if (typeof it.timestamp === 'number') posted_at = new Date(it.timestamp * 1000).toISOString();

  const rawMedia = Array.isArray(it.media) ? (it.media as Array<Record<string, unknown>>) : [];
  const media: string[] = [];
  let hasVideo = false;
  for (const m of rawMedia) {
    if (m.__typename === 'Video') hasVideo = true;
    // Prefer the CDN image (thumbnail / photo_image.uri) over the post PAGE url,
    // which can't be rendered as an <Image>.
    const photo = m.photo_image as { uri?: string } | undefined;
    const u = (m.thumbnail ?? photo?.uri ?? m.image ?? m.url) as string | undefined;
    if (u) media.push(u);
  }
  const type = hasVideo ? 'video' : media.length ? 'image' : 'text';
  return { external_post_id: String(id), type, text, media, permalink, posted_at };
}

type ScrapeResult = { fetched: number; inserted: number; error?: string; skipped?: boolean };

// Skip a fresh Apify run (which costs credits) if this source was scraped very
// recently — repeated manual syncs in quick succession won't find new posts.
const SCRAPE_COOLDOWN_MS = 5 * 60 * 1000;

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

  const { data: state } = await admin
    .from('source_poll_state')
    .select('last_seen_at')
    .eq('connection_id', conn.id)
    .maybeSingle();
  const last = (state as { last_seen_at?: string } | null)?.last_seen_at;
  if (last && Date.now() - new Date(last).getTime() < SCRAPE_COOLDOWN_MS) {
    return { fetched: 0, inserted: 0, skipped: true };
  }

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
        permalink: p.permalink,
        posted_at: p.posted_at,
      },
      { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true, count: 'exact' },
    );
    if (error) return { fetched: list.length, inserted, error: `db: ${error.message}` };
    inserted += count ?? 0;
  }
  // Stamp the scrape time so the cooldown can short-circuit the next sync.
  await admin
    .from('source_poll_state')
    .upsert(
      { connection_id: conn.id, last_seen_at: new Date().toISOString() },
      { onConflict: 'connection_id' },
    );
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
