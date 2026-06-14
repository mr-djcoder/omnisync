import '../global.css';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSentry, Sentry } from '../sentry';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { useAuth } from '../src/features/auth/useAuth';
import { useOnboarded } from '../src/features/connections/useOnboarded';

initSentry();

function Guard() {
  const { session, loading } = useAuth();
  const onboarded = useOnboarded(session?.user.id ?? null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0];
    if (!session) {
      if (group !== '(auth)') router.replace('/(auth)/welcome');
      return;
    }
    // Signed in: wait until onboarding state resolves.
    if (onboarded === null) return;
    if (!onboarded && group !== '(onboarding)') router.replace('/(onboarding)/connect');
    else if (onboarded && (group === '(auth)' || group === '(onboarding)')) router.replace('/(app)');
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
