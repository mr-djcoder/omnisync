import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!dsn) return; // disabled locally / until a DSN is configured
  Sentry.init({
    dsn,
    // Adds request/user context (IP, cookies, user). Review for your privacy posture.
    sendDefaultPii: true,
    enableLogs: true,
    tracesSampleRate: 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
  });
}

export { Sentry };
