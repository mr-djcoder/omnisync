import '../global.css';
import { useEffect, useRef } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSentry, Sentry } from '../sentry';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { useAuth } from '../src/features/auth/useAuth';
import { useOnboarded } from '../src/features/connections/useOnboarded';
import { registerPush } from '../src/features/push/registerPush';

initSentry();

function Guard() {
  const { session, loading } = useAuth();
  const onboarded = useOnboarded(session?.user.id ?? null);
  const segments = useSegments();
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

function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Guard />
    </AuthProvider>
  );
}

export default Sentry.wrap(RootLayout);
