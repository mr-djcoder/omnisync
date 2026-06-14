// Returns { exists: boolean } for an email, using the service-role key (server-only).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  const { email } = await req.json().catch(() => ({ email: '' }));
  if (typeof email !== 'string' || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'invalid email' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // listUsers is paginated; for MVP scan the first page and match by email.
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return new Response(JSON.stringify({ error: 'lookup failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const exists = data.users.some((u) => u.email?.toLowerCase() === email.toLowerCase());
  return new Response(JSON.stringify({ exists }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
