import type { Provider } from '@omnisync/shared';

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
  const [{ makeRedirectUri }, WebBrowser, { supabase }, SecureStore] = await Promise.all([
    import('expo-auth-session'),
    import('expo-web-browser'),
    import('../../lib/supabase'),
    import('expo-secure-store'),
  ]);
  const redirectUri = makeRedirectUri({ scheme: 'omnisync' });
  const appId = process.env.EXPO_PUBLIC_META_APP_ID ?? '';
  const scope = 'pages_show_list,pages_read_user_content,pages_manage_posts';
  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  await SecureStore.setItemAsync('oauth_intent', 'facebook');
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success') return { error: 'cancelled' };
  const code = new URL(result.url).searchParams.get('code');
  if (!code) return { error: 'no code' };
  const { data, error } = await supabase.functions.invoke('oauth-exchange', {
    body: { provider: 'facebook', code, redirect_uri: redirectUri },
  });
  if (error) return { error: error.message };
  return { connected: (data as { connected: number }).connected };
}
