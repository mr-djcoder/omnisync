// Bounces the OAuth provider redirect back into the app via a 302 to the
// app's custom scheme. A server-side redirect avoids the gateway forcing an
// HTML body to text/plain (which left users staring at raw source), and it
// works whether the in-app auth session is listening for omnisync:// or the
// app catches the deep link directly.
Deno.serve((req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const error = url.searchParams.get('error');
  const target =
    `omnisync://?code=${encodeURIComponent(code)}` +
    (error ? `&error=${encodeURIComponent(error)}` : '');
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'no-store' },
  });
});
