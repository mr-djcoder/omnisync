import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const SecureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: SecureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Native OAuth returns an authorization ?code= that we exchange manually;
    // the default implicit flow would return a #fragment we can't read here.
    flowType: 'pkce',
  },
});

// Refresh the access token if it's expired or about to be, so the *first*
// authenticated request after the app sat idle doesn't 401 and fail (only for
// the caller to retry and succeed once the background refresh has run).
export async function ensureFreshSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) return;
  if (!s.expires_at || s.expires_at * 1000 < Date.now() + 60_000) {
    await supabase.auth.refreshSession();
  }
}
