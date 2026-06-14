export type AuthMode = 'login' | 'signup';

export function parseLookupResponse(payload: unknown): { mode: AuthMode } {
  if (payload && typeof payload === 'object' && 'exists' in payload) {
    return { mode: (payload as { exists: boolean }).exists ? 'login' : 'signup' };
  }
  return { mode: 'signup' };
}

export async function lookupEmail(email: string): Promise<{ mode: AuthMode }> {
  // Dynamic import keeps the native supabase client out of the Node unit-test graph.
  const { supabase } = await import('../../lib/supabase');
  const { data, error } = await supabase.functions.invoke('auth-email-lookup', {
    body: { email },
  });
  if (error) return { mode: 'signup' };
  return parseLookupResponse(data);
}
