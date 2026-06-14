import { supabase } from '../../lib/supabase';

export async function registerPush(userId: string): Promise<void> {
  try {
    // Dynamic import so the app typechecks/builds even if expo-notifications is not yet installed.
    // The operator runs `expo install expo-notifications` to activate this path.
    const modName = 'expo-notifications';
    const Notifications = await (Function('m', 'return import(m)')(modName) as Promise<{
      requestPermissionsAsync: () => Promise<{ status: string }>;
      getExpoPushTokenAsync: () => Promise<{ data: string }>;
    }>);
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const tokenResp = await Notifications.getExpoPushTokenAsync();
    const token = tokenResp.data;
    await supabase.from('push_tokens').upsert({ user_id: userId, token });
  } catch {
    // expo-notifications not installed or permission unavailable — no-op until operator installs it.
  }
}
