// Proxy for draft-target RPCs — keeps the encryption key server-side.
// The app passes its user JWT; this function authenticates the user and calls
// the existing get_draft_targets / save_draft_target RPCs with the server key.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;
  const body = await req.json().catch(() => ({}));

  if (body.action === 'list') {
    const { draft_id } = body;
    if (!draft_id) {
      return new Response(JSON.stringify({ error: 'missing draft_id' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { data, error } = await userClient.rpc('get_draft_targets', {
      p_draft_id: draft_id,
      p_enc_key: encKey,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ targets: data }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (body.action === 'save') {
    const { draft_id, connection_id, text, media } = body;
    if (!draft_id || !connection_id) {
      return new Response(JSON.stringify({ error: 'missing draft_id or connection_id' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { data, error } = await userClient.rpc('save_draft_target', {
      p_draft_id: draft_id,
      p_connection_id: connection_id,
      p_text: text,
      p_media: media ?? [],
      p_enc_key: encKey,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ id: data }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'invalid action' }), {
    status: 400,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
