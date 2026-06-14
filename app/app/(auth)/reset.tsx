import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { isValidEmail } from '../../src/lib/validation';
import { supabase } from '../../src/lib/supabase';

export default function Reset() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    setError(null);
    if (!isValidEmail(email)) {
      setError('Enter a valid email.');
      return;
    }
    const { error: e } = await supabase.auth.resetPasswordForEmail(email);
    if (e) setError(e.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-md gap-sm">
        <Text className="text-on-surface text-xl font-bold">Check your inbox</Text>
        <Text className="text-on-surface-variant text-center">
          If an account exists for that email, a reset link is on its way.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background justify-center px-md gap-md">
      <Text className="text-on-surface text-2xl font-bold">Reset your password</Text>
      <TextInput
        className="bg-surface-container-lowest text-on-surface rounded-lg px-md py-3"
        placeholder="name@company.com"
        placeholderTextColor="#988d9f"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {error && <Text className="text-error">{error}</Text>}
      <Pressable
        className="bg-primary rounded-lg py-4 items-center active:opacity-80"
        onPress={onSend}
      >
        <Text className="text-on-primary font-semibold">Send reset link</Text>
      </Pressable>
    </View>
  );
}
