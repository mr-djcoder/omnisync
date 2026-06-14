Deno.serve((req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const error = url.searchParams.get('error');
  const target =
    `omnisync://?code=${encodeURIComponent(code)}` +
    (error ? `&error=${encodeURIComponent(error)}` : '');
  const safe = JSON.stringify(target);
  const html = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${target}"></head><body>Redirecting…<script>location.replace(${safe});</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
