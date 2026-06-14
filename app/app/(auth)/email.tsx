import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { isValidEmail } from '../../src/lib/validation';
import { lookupEmail, type AuthMode } from '../../src/features/auth/emailLookup';
import { useAuth } from '../../src/features/auth/useAuth';

export default function EmailAuth() {
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [stage, setStage] = useState<'email' | AuthMode>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onContinue() {
    setError(null);
    if (stage === 'email') {
      if (!isValidEmail(email)) {
        setError('Enter a valid email.');
        return;
      }
      setBusy(true);
      const { mode } = await lookupEmail(email);
      setBusy(false);
      setStage(mode);
      return;
    }
    setBusy(true);
    const res =
      stage === 'signup'
        ? await signUpWithEmail(email, password, username || email.split('@')[0])
        : await signInWithEmail(email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    // On success the root guard redirects to /(app).
  }

  const title =
    stage === 'signup'
      ? 'Create your account'
      : stage === 'login'
        ? 'Welcome back'
        : 'Continue with Email';
  const cta = stage === 'signup' ? 'Create account' : stage === 'login' ? 'Log in' : 'Continue';

  return (
    <View className="flex-1 bg-background px-md justify-center gap-md">
      <Text className="text-on-surface text-2xl font-bold">{title}</Text>

      <TextInput
        className="bg-surface-container-lowest text-on-surface rounded-lg px-md py-3"
        placeholder="name@company.com"
        placeholderTextColor="#988d9f"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        editable={stage === 'email'}
        onChangeText={setEmail}
      />

      {stage === 'signup' && (
        <TextInput
          className="bg-surface-container-lowest text-on-surface rounded-lg px-md py-3"
          placeholder="username"
          placeholderTextColor="#988d9f"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
      )}

      {stage !== 'email' && (
        <View className="gap-1">
          <View className="flex-row items-center bg-surface-container-lowest rounded-lg px-md">
            <TextInput
              className="flex-1 text-on-surface py-3"
              placeholder="Password"
              placeholderTextColor="#988d9f"
              secureTextEntry={!show}
              value={password}
              onChangeText={setPassword}
            />
            <Text onPress={() => setShow((s) => !s)} className="text-secondary pl-md">
              {show ? 'Hide' : 'Show'}
            </Text>
          </View>
          {stage === 'login' && (
            <Text onPress={() => router.push('/(auth)/reset')} className="text-primary self-end">
              Forgot password?
            </Text>
          )}
        </View>
      )}

      {error && <Text className="text-error">{error}</Text>}

      <Pressable
        disabled={busy}
        className="bg-primary rounded-lg py-4 items-center active:opacity-80"
        onPress={onContinue}
      >
        <Text className="text-on-primary font-semibold">{busy ? '…' : cta}</Text>
      </Pressable>
    </View>
  );
}
