// Generates per-platform variations for a source post and writes a draft + targets.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// mirrors packages/shared/src/variation.ts (kept in sync by hand)
function buildVariationPrompt(sourceText: string, platforms: string[]): string {
  return [
    'You are a social media copywriter. Rewrite the source post for each target platform,',
    "respecting each platform's tone and length norms. Return ONLY a JSON object mapping",
    `each platform name to its rewritten text. Platforms: ${platforms.join(', ')}.`,
    '',
    `Source post:\n${sourceText}`,
  ].join('\n');
}

interface AIProvider {
  generate(prompt: string): Promise<Record<string, string>>;
}

const gemini: AIProvider = {
  async generate(prompt) {
    const key = Deno.env.get('GEMINI_API_KEY')!;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    try {
      const parsed = JSON.parse(text);
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
      return out;
    } catch {
      return {};
    }
  },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: u } = await userClient.auth.getUser();
  if (!u.user)
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const { source_post_id } = await req.json().catch(() => ({}));
  if (!source_post_id)
    return new Response(JSON.stringify({ error: 'missing source_post_id' }), {
      status: 400,
      headers: cors,
    });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  const { data: post } = await admin
    .from('source_posts')
    .select('*')
    .eq('id', source_post_id)
    .maybeSingle();
  if (!post || post.user_id !== u.user.id)
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

  const { data: allConns } = await admin
    .from('social_connections')
    .select('id, provider, connector_type')
    .eq('user_id', u.user.id)
    .eq('status', 'active');
  // Public-link (scrape) sources are monitor-only — never publish targets.
  const conns = (allConns ?? []).filter(
    (c: { connector_type: string }) => c.connector_type !== 'scrape',
  );
  if (conns.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'No channel to publish to. Connect an account before remixing.',
      }),
      { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
  const platforms = conns.map((c: { provider: string }) => c.provider);
  const variations = await gemini.generate(buildVariationPrompt(post.text, platforms));

  const { data: draft, error: draftErr } = await admin
    .from('drafts')
    .insert({
      user_id: u.user.id,
      source_post_id,
      origin: 'remix',
      content_mode: 'shared',
      status: 'pending',
    })
    .select('id')
    .single();

  if (draftErr || !draft) {
    return new Response(
      JSON.stringify({ error: `Could not create draft: ${draftErr?.message ?? 'unknown'}` }),
      {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    );
  }

  const warnings: string[] = [];
  for (const c of conns ?? []) {
    const text = variations[(c as { provider: string }).provider] ?? post.text;
    const { error: rpcErr } = await admin.rpc('save_draft_target', {
      p_draft_id: draft.id,
      p_connection_id: (c as { id: string }).id,
      p_text: text,
      p_media: post.media,
      p_enc_key: encKey,
    });
    if (rpcErr) warnings.push(rpcErr.message);
  }

  // Surface a setup problem (e.g. missing RPC) rather than returning a draft
  // that has no editable targets.
  if (warnings.length > 0 && warnings.length === (conns ?? []).length) {
    return new Response(
      JSON.stringify({ error: `Could not prepare channels: ${warnings[0]}`, draft_id: draft.id }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ draft_id: draft.id, warnings }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
