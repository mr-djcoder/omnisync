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

export async function connectFacebook(): Promise<{ error?: string }> {
  const [WebBrowser, SecureStore] = await Promise.all([
    import('expo-web-browser'),
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
  // auth_type=reauthenticate forces Facebook to show the login/re-auth screen
  // instead of silently continuing with the previously remembered account, so
  // the user can log in fresh (or switch accounts) on each Add.
  const authUrl =
    `https://m.facebook.com/v21.0/dialog/oauth?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${scope}` +
    `&response_type=code&auth_type=reauthenticate`;
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

  // Open the OAuth in the system browser. The omnisync:// return is handled by
  // AuthProvider's global deep-link handler, which performs the code exchange in
  // a stable root context that survives the return navigation. Doing the
  // exchange here races that handler on the single-use code and can be torn down
  // when the OAuth return navigates away from this screen.
  await WebBrowser.openAuthSessionAsync(authUrl, 'omnisync://', browserOpts);
  return {};
}

export async function addScrapeSource(url: string): Promise<{ error?: string }> {
  const handle = parseFacebookHandle(url);
  if (!handle) return { error: 'Enter a valid Facebook page URL.' };
  const { supabase } = await import('../../lib/supabase');
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: 'unauthorized' };
  // Reject a page that's already added (friendlier than the raw unique-constraint
  // error from the DB).
  const { data: existing } = await supabase
    .from('social_connections')
    .select('id')
    .eq('user_id', u.user.id)
    .eq('provider', 'facebook')
    .eq('external_id', handle)
    .eq('connector_type', 'scrape')
    .maybeSingle();
  if (existing) return { error: 'This page is already added.' };
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

// Delete a connection. master_source / source_poll_state cascade automatically.
export async function removeConnection(connectionId: string): Promise<{ error?: string }> {
  const { supabase } = await import('../../lib/supabase');
  const { error } = await supabase.from('social_connections').delete().eq('id', connectionId);
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
