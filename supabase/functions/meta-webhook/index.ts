import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verification handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  const payload = JSON.parse(raw);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Idempotency: store the raw event.
  const idem = `${payload.entry?.[0]?.id ?? 'x'}:${payload.entry?.[0]?.time ?? Date.now()}`;
  await admin
    .from('webhook_events')
    .upsert(
      { idempotency_key: idem, payload },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

  // For each changed page, map to a connection and insert a source_post.
  for (const entry of payload.entry ?? []) {
    const pageId: string = entry.id;
    const { data: conn } = await admin
      .from('social_connections')
      .select('id, user_id')
      .eq('provider', 'facebook')
      .eq('external_id', pageId)
      .maybeSingle();
    if (!conn) continue;
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const postId: string | undefined = v.post_id ?? v.id;
      if (!postId) continue;
      await admin.from('source_posts').upsert(
        {
          user_id: conn.user_id,
          connection_id: conn.id,
          external_post_id: postId,
          type: 'text',
          text: v.message ?? '',
          media: [],
        },
        { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true },
      );
    }
  }

  return new Response('ok', { status: 200 });
});
