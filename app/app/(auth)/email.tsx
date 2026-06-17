import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { isValidEmail } from '../../src/lib/validation';
import { lookupEmail, type AuthMode } from '../../src/features/auth/emailLookup';
import { useAuth } from '../../src/features/auth/useAuth';
import { useTheme } from '../../theme/useTheme';
import { Screen, Button, Field, Icon } from '../../src/ui';

export default function EmailAuth() {
  const router = useRouter();
  const { colors } = useTheme();
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
  const subtitle =
    stage === 'signup'
      ? 'Pick a username and a password to get started.'
      : stage === 'login'
        ? 'Enter your password to log in.'
        : "Enter your email — we'll log you in or help you create an account.";
  const cta = stage === 'signup' ? 'Create account' : stage === 'login' ? 'Log in' : 'Continue';
  const heroIcon = stage === 'signup' ? 'person-add' : stage === 'login' ? 'log-in' : 'mail';

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-xl pt-xl">
        {/* Hero */}
        <View className="items-center gap-md">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container border border-outline-variant">
            <Icon name={heroIcon} size={40} color="primary" />
          </View>
          <Text className="text-on-surface text-3xl font-extrabold tracking-tight text-center">
            {title}
          </Text>
          <Text className="text-on-surface-variant text-center text-base max-w-[300px]">
            {subtitle}
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
            editable={stage === 'email'}
            onChangeText={setEmail}
          />

          {stage === 'signup' && (
            <Field
              label="Username"
              placeholder="creator_handle"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
          )}

          {stage !== 'email' && (
            <View className="gap-sm">
              <View className="flex-row items-center justify-between">
                <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
                  Password
                </Text>
                {stage === 'login' && (
                  <Text
                    onPress={() => router.push('/(auth)/reset')}
                    className="text-primary text-xs font-semibold"
                  >
                    Forgot password?
                  </Text>
                )}
              </View>
              <View className="flex-row items-center bg-surface-container-lowest border border-outline-variant rounded-xl px-md">
                <TextInput
                  className="flex-1 py-3 text-on-surface"
                  placeholder="Enter your password"
                  placeholderTextColor={colors.outline}
                  secureTextEntry={!show}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable
                  onPress={() => setShow((s) => !s)}
                  className="pl-md py-3 active:opacity-70"
                >
                  <Icon
                    name={show ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="on-surface-variant"
                  />
                </Pressable>
              </View>
            </View>
          )}

          {error && (
            <View className="flex-row items-center gap-sm rounded-xl bg-error/10 px-md py-3">
              <Icon name="alert-circle-outline" size={18} color="error" />
              <Text className="text-error flex-1 text-sm">{error}</Text>
            </View>
          )}

          <Button label={cta} onPress={onContinue} loading={busy} size="lg" />
        </View>

        <Text className="text-outline text-center text-xs px-lg">
          By continuing, you agree to OmniSync&apos;s Terms of Service and Privacy Policy.
        </Text>
      </View>
    </Screen>
  );
}
