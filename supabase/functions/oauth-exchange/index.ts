// Exchanges a provider OAuth code for a token, encrypts it, and upserts a connection.
// Service-role + encryption key are server-only secrets.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ExchangeBody = {
  provider: string;
  code: string;
  redirect_uri: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // Identify the calling user from their bearer token.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  const body = (await req.json().catch(() => null)) as ExchangeBody | null;
  if (!body || body.provider !== 'facebook' || !body.code) {
    return new Response(JSON.stringify({ error: 'invalid request' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Exchange the code for a token with Meta.
  const appId = Deno.env.get('META_APP_ID')!;
  const appSecret = Deno.env.get('META_APP_SECRET')!;
  const tokenUrl =
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}` +
    `&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(body.redirect_uri)}` +
    `&code=${encodeURIComponent(body.code)}`;
  const tokenRes = await fetch(tokenUrl);
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return new Response(JSON.stringify({ error: 'token exchange failed' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const userToken: string = tokenJson.access_token;

  // Fetch the pages the user administers (each becomes a connection).
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
  );
  const pagesJson = await pagesRes.json();
  const pages: Array<{ id: string; name: string; access_token: string }> = pagesJson.data ?? [];

  // Service-role client for encrypted writes (RPC encrypts inside Postgres).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  for (const page of pages) {
    await admin.rpc('upsert_connection', {
      p_user_id: userId,
      p_provider: 'facebook',
      p_external_id: page.id,
      p_handle: page.name,
      p_scopes: ['pages_show_list', 'pages_read_user_content', 'pages_manage_posts'],
      p_token: page.access_token,
      p_enc_key: encKey,
    });
  }

  return new Response(JSON.stringify({ connected: pages.length }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
