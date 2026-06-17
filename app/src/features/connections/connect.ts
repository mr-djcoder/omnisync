import type { Provider } from '@omnisync/shared';
import { parseFacebookHandle } from '@omnisync/shared';
import { META_REDIRECT_URI } from '../../lib/metaRedirect';

const LABELS: Record<Provider, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

// v1: only Facebook is wired; others are "coming soon".
const WIRED: Provider[] = ['facebook'];

export function providerLabel(p: Provider): string {
  return LABELS[p];
}

export function isWired(p: Provider): boolean {
  return WIRED.includes(p);
}

export async function connectFacebook(): Promise<{ error?: string; connected?: number }> {
  const [WebBrowser, { supabase }, SecureStore] = await Promise.all([
    import('expo-web-browser'),
    import('../../lib/supabase'),
    import('expo-secure-store'),
  ]);
  const appId = process.env.EXPO_PUBLIC_META_APP_ID ?? '';
  const scope = 'pages_show_list,pages_read_user_content,pages_manage_posts';
  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${scope}&response_type=code`;
  await SecureStore.setItemAsync('oauth_intent', 'facebook');
  // The oauth-redirect function bounces to this fixed app scheme, so the
  // browser session must watch for it (not the dev-client URL makeRedirectUri
  // returns in development) to close and hand the code back.
  const result = await WebBrowser.openAuthSessionAsync(authUrl, 'omnisync://');
  if (result.type !== 'success') return { error: 'cancelled' };
  const code = new URL(result.url).searchParams.get('code');
  if (!code) return { error: 'no code' };
  const { data, error } = await supabase.functions.invoke('oauth-exchange', {
    body: { provider: 'facebook', code, redirect_uri: META_REDIRECT_URI },
  });
  if (error) return { error: error.message };
  return { connected: (data as { connected: number }).connected };
}

export async function addScrapeSource(url: string): Promise<{ error?: string }> {
  const handle = parseFacebookHandle(url);
  if (!handle) return { error: 'Enter a valid Facebook page URL.' };
  const { supabase } = await import('../../lib/supabase');
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: 'unauthorized' };
  const { error } = await supabase.from('social_connections').insert({
    user_id: u.user.id,
    provider: 'facebook',
    external_id: handle,
    handle,
    is_owned: false,
    connector_type: 'scrape',
    status: 'active',
    sync_mode: 'manual',
  });
  return error ? { error: error.message } : {};
}

export async function setSyncMode(connectionId: string, mode: 'manual' | 'auto') {
  const { supabase } = await import('../../lib/supabase');
  await supabase.from('social_connections').update({ sync_mode: mode }).eq('id', connectionId);
}

export async function syncNow(
  connectionId: string,
): Promise<{ error?: string; fetched?: number; inserted?: number }> {
  const { supabase } = await import('../../lib/supabase');
  const { data, error } = await supabase.functions.invoke('scrape-sources', {
    body: { connection_id: connectionId },
  });
  if (error) return { error: error.message };
  const d = (data ?? {}) as { error?: string; fetched?: number; inserted?: number };
  if (d.error) return { error: d.error };
  return { fetched: d.fetched, inserted: d.inserted };
}
