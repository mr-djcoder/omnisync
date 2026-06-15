import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { isValidEmail } from '../../src/lib/validation';
import { supabase } from '../../src/lib/supabase';
import { Screen, Button, Field, Icon } from '../../src/ui';

export default function Reset() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSend() {
    setError(null);
    if (!isValidEmail(email)) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (e) setError(e.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-xl">
          <View className="items-center gap-md">
            <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary-container">
              <Icon name="mail-open" size={40} color="on-primary-container" />
            </View>
            <Text className="text-on-surface text-3xl font-extrabold tracking-tight text-center">
              Check your inbox
            </Text>
            <Text className="text-on-surface-variant text-center text-base max-w-[300px]">
              If an account exists for that email, a reset link is on its way.
            </Text>
          </View>

          <Button
            label="Back to sign in"
            icon="arrow-back"
            variant="tonal"
            onPress={() => router.replace('/(auth)/email')}
            className="max-w-sm"
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-xl pt-xl">
        {/* Hero */}
        <View className="items-center gap-md">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container border border-outline-variant">
            <Icon name="lock-closed" size={38} color="primary" />
          </View>
          <Text className="text-on-surface text-3xl font-extrabold tracking-tight text-center">
            Reset your password
          </Text>
          <Text className="text-on-surface-variant text-center text-base max-w-[300px]">
            Enter your account email and we&apos;ll send a reset link.
          </Text>
        </View>

        {/* Form card */}
        <View className="w-full max-w-sm self-center rounded-3xl bg-surface-container-low border border-outline-variant p-lg gap-md">
          <Field
            label="Email"
            placeholder="name@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          {error && (
            <View className="flex-row items-center gap-sm rounded-xl bg-error/10 px-md py-3">
              <Icon name="alert-circle-outline" size={18} color="error" />
              <Text className="text-error flex-1 text-sm">{error}</Text>
            </View>
          )}

          <Button
            label="Send reset link"
            icon="paper-plane"
            onPress={onSend}
            loading={busy}
            size="lg"
          />
        </View>

        <Text
          onPress={() => router.replace('/(auth)/email')}
          className="text-primary text-center text-sm font-semibold"
        >
          Back to sign in
        </Text>
      </View>
    </Screen>
  );
}
