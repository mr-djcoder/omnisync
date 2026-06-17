// Streams an external image/video through our origin so it renders in the app.
// Facebook/Instagram CDNs block hotlinking from non-FB origins, leaving blank
// boxes; fetching server-side avoids that. Host-allowlisted to avoid being an
// open proxy.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ALLOWED_SUFFIXES = ['fbcdn.net', 'facebook.com', 'cdninstagram.com', 'akamaihd.net'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const raw = new URL(req.url).searchParams.get('u');
  if (!raw) return new Response('missing u', { status: 400, headers: cors });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('bad url', { status: 400, headers: cors });
  }
  if (target.protocol !== 'https:' || !ALLOWED_SUFFIXES.some((d) => target.hostname.endsWith(d))) {
    return new Response('forbidden host', { status: 403, headers: cors });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,video/*,*/*;q=0.8',
      },
    });
  } catch (e) {
    return new Response(`fetch failed: ${String(e)}`, { status: 502, headers: cors });
  }
  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, { status: 502, headers: cors });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
