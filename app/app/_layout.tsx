import '../global.css';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSentry, Sentry } from '../sentry';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { useAuth } from '../src/features/auth/useAuth';

initSentry();

function Guard() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/(auth)/welcome');
    else if (session && inAuthGroup) router.replace('/(app)');
  }, [session, loading, segments, router]);

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
