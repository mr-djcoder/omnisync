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

  // Pin the auth session to a real system browser (Custom Tab). Without this,
  // Android may hand the facebook.com URL to the Facebook app, which can't run a
  // web OAuth and bounces straight back without returning a code.
  let browserOpts: { browserPackage?: string } | undefined;
  try {
    const info = await WebBrowser.getCustomTabsSupportingBrowsersAsync();
    const pkg =
      info?.preferredBrowserPackage ?? info?.defaultBrowserPackage ?? info?.browserPackages?.[0];
    if (pkg) browserOpts = { browserPackage: pkg };
  } catch {
    browserOpts = undefined;
  }

  // Browser path: the redirect returns in-tab, so we get the code here and
  // exchange it (clearing the intent so AuthProvider's global deep-link handler
  // doesn't also try to exchange the same single-use code).
  const result = await WebBrowser.openAuthSessionAsync(authUrl, 'omnisync://', browserOpts);
  if (result.type === 'success') {
    let code: string | null;
    try {
      code = new URL(result.url).searchParams.get('code');
    } catch {
      code = null;
    }
    if (code) {
      await SecureStore.deleteItemAsync('oauth_intent');
      const { data, error } = await supabase.functions.invoke('oauth-exchange', {
        body: { provider: 'facebook', code, redirect_uri: META_REDIRECT_URI },
      });
      if (error) return { error: error.message };
      return { connected: (data as { connected: number }).connected };
    }
  }

  // Facebook-app path (or dismissed): the in-tab session didn't return the code.
  // If the Facebook app handled login, the omnisync:// deep link is delivered to
  // AuthProvider's global handler, which performs the exchange (intent stays set
  // so it runs the facebook branch). Don't surface an error here; the Connect
  // screen refreshes on focus and the new account appears once the exchange runs.
  return {};
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
