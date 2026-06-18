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
  const [WebBrowser, { supabase }, SecureStore, Linking] = await Promise.all([
    import('expo-web-browser'),
    import('../../lib/supabase'),
    import('expo-secure-store'),
    import('expo-linking'),
  ]);
  const appId = process.env.EXPO_PUBLIC_META_APP_ID ?? '';
  // Page scopes + Instagram publishing (IG Business accounts linked to a Page
  // are discovered and connected during this same exchange).
  const scope =
    'pages_show_list,pages_read_user_content,pages_manage_posts,instagram_basic,instagram_content_publish';
  // Use m.facebook.com (not www): the Facebook app registers Android App Links
  // for www.facebook.com and hijacks the OAuth dialog, which breaks the redirect
  // back into the in-app browser session. m.facebook.com stays in the browser.
  const authUrl =
    `https://m.facebook.com/v21.0/dialog/oauth?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${scope}&response_type=code`;
  await SecureStore.setItemAsync('oauth_intent', 'facebook');

  // The Facebook app often handles the OAuth in-app, so the in-tab browser
  // session never resolves with the redirect. Resolve on whichever returns
  // first: the omnisync:// deep link (caught directly) or the auth-session
  // success. On dismiss we wait briefly in case the deep link is still arriving.
  const code = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      sub.remove();
      clearTimeout(backstop);
      WebBrowser.dismissAuthSession?.();
      resolve(value);
    };
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith('omnisync://')) return;
      try {
        const u = new URL(url);
        const c = u.searchParams.get('code');
        if (c || u.searchParams.get('error')) finish(c);
      } catch {
        finish(null);
      }
    });
    const backstop = setTimeout(() => finish(null), 180000);
    WebBrowser.openAuthSessionAsync(authUrl, 'omnisync://').then((result) => {
      if (result.type === 'success') {
        try {
          finish(new URL(result.url).searchParams.get('code'));
        } catch {
          finish(null);
        }
      } else {
        setTimeout(() => finish(null), 1500);
      }
    });
  });

  if (!code) return { error: 'cancelled' };
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
