import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { META_REDIRECT_URI } from '../../lib/metaRedirect';
import { AuthContext, type AuthState } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      let code: string | null;
      try {
        code = new URL(url).searchParams.get('code');
      } catch {
        return;
      }
      if (!code) return;
      const intent = await SecureStore.getItemAsync('oauth_intent');
      if (intent === 'facebook') {
        // Connecting a Facebook account (not a login). Exchange here, in the
        // root context, so it isn't torn down by the OAuth-return navigation;
        // then land on Connect so the new account is visible.
        await SecureStore.deleteItemAsync('oauth_intent');
        try {
          const { data, error } = await supabase.functions.invoke('oauth-exchange', {
            body: { provider: 'facebook', code, redirect_uri: META_REDIRECT_URI },
          });
          // Stash the outcome so the Connect screen can report it (added pages,
          // "no Pages found", or an error) — AuthProvider has no UI of its own.
          await SecureStore.setItemAsync(
            'fb_connect_result',
            JSON.stringify(error ? { error: error.message } : (data ?? {})),
          );
        } catch {
          await SecureStore.setItemAsync('fb_connect_result', JSON.stringify({ error: 'network' }));
        }
        router.replace('/(app)/connect');
      } else {
        await supabase.auth.exchangeCodeForSession(code);
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      signInWithEmail: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      signUpWithEmail: async (email, password, username) => {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        return error ? { error: error.message } : {};
      },
      signInWithGoogle: async () => {
        const redirectTo = makeRedirectUri({ scheme: 'omnisync' });
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) return { error: error?.message ?? 'oauth failed' };
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') return { error: 'cancelled' };
        const code = new URL(result.url).searchParams.get('code');
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) return { error: exErr.message };
        }
        return {};
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
