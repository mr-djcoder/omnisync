import '../global.css';
import { useEffect, useRef } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initSentry, Sentry } from '../sentry';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { useAuth } from '../src/features/auth/useAuth';
import { useOnboarded } from '../src/features/connections/useOnboarded';
import { registerPush } from '../src/features/push/registerPush';
import { ThemeProvider } from '../theme/ThemeContext';
import { useTheme } from '../theme/useTheme';

initSentry();

function Guard() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  // Re-check onboarding whenever the route group changes (e.g. after creating
  // the master source and navigating into (app)) so the guard never acts on a
  // stale value.
  const onboarded = useOnboarded(session?.user.id ?? null, segments[0]);
  const router = useRouter();
  const pushRegistered = useRef(false);

  useEffect(() => {
    if (loading) return;
    const group = segments[0];
    if (!session) {
      pushRegistered.current = false;
      if (group !== '(auth)') router.replace('/(auth)/welcome');
      return;
    }
    // Register push token once per session (defensive: no-ops if module absent).
    if (!pushRegistered.current) {
      pushRegistered.current = true;
      void registerPush(session.user.id);
    }
    // Signed in: wait until onboarding state resolves.
    if (onboarded === null) return;
    if (!onboarded && group !== '(onboarding)') router.replace('/(onboarding)/connect');
    else if (onboarded && (group === '(auth)' || group === '(onboarding)'))
      router.replace('/(app)');
  }, [session, loading, onboarded, segments, router]);

  return <Slot />;
}

function ThemedStatusBar() {
  // Track the (possibly overridden) scheme rather than the OS so the bar flips
  // immediately when the user toggles the theme in Profile.
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <Guard />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
