import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!dsn) return; // disabled locally / until a DSN is configured
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
  });
}

export { Sentry };
