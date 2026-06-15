Deno.serve((req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const error = url.searchParams.get('error');
  const target =
    `omnisync://?code=${encodeURIComponent(code)}` +
    (error ? `&error=${encodeURIComponent(error)}` : '');
  const safe = JSON.stringify(target);
  // Auto-redirect to the app, but also render a clear tappable link: mobile
  // browsers often block an automatic navigation to a custom URL scheme unless
  // it comes from a user gesture, which would otherwise leave the user stuck
  // on this page.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${target}">
<title>OmniSync</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#16111b; color:#eadfed; }
  .card { text-align:center; padding:32px 24px; max-width:340px; }
  h1 { font-size:20px; margin:0 0 8px; }
  p { color:#cfc2d6; font-size:14px; margin:0 0 24px; }
  a.btn { display:inline-block; background:#ddb7ff; color:#490080; text-decoration:none;
          font-weight:600; padding:14px 24px; border-radius:999px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Almost done</h1>
    <p>Returning you to OmniSync…</p>
    <a class="btn" href="${target}">Open OmniSync</a>
  </div>
  <script>setTimeout(function(){location.replace(${safe});}, 50);</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
