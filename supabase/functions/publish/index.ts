import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const { draft_id } = await req.json().catch(() => ({}));
  if (!draft_id) return new Response(JSON.stringify({ error: 'missing draft_id' }), { status: 400, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  // Ownership check.
  const { data: draft } = await admin.from('drafts').select('id, user_id').eq('id', draft_id).maybeSingle();
  if (!draft || draft.user_id !== u.user.id) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

  // Decrypt targets (user-context RPC + server key).
  const { data: targets } = await userClient.rpc('get_draft_targets', { p_draft_id: draft_id, p_enc_key: encKey });

  const results: Array<{ connection_id: string; status: string }> = [];
  for (const t of (targets ?? []) as Array<{ connection_id: string; text: string }>) {
    const { data: conn } = await admin
      .from('social_connections').select('provider, external_id').eq('id', t.connection_id).maybeSingle();
    let status = 'failed';
    let externalId: string | null = null;
    if (conn?.provider === 'facebook') {
      const { data: token } = await admin.rpc('get_connection_token', { p_connection_id: t.connection_id, p_enc_key: encKey });
      if (token) {
        const res = await fetch(`https://graph.facebook.com/v21.0/${conn.external_id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: t.text, access_token: token }),
        });
        const j = await res.json();
        if (res.ok && j.id) {
          status = 'success';
          externalId = j.id;
        }
      }
    }
    await admin.from('publications').insert({
      user_id: u.user.id,
      draft_id,
      connection_id: t.connection_id,
      external_post_id: externalId,
      status,
    });
    results.push({ connection_id: t.connection_id, status });
  }

  await admin.from('drafts').update({ status: 'published' }).eq('id', draft_id);

  return new Response(JSON.stringify({ results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
