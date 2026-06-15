import { useState } from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
};

// Labeled, theme-aware text input with a focus ring.
export function Field({ label, error, hint, className = '', ...rest }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-error' : focused ? 'border-primary' : 'border-outline-variant';

  return (
    <View className={`gap-sm ${className}`}>
      {label ? (
        <Text className="text-on-surface-variant text-xs font-semibold uppercase tracking-wide">
          {label}
        </Text>
      ) : null}
      <TextInput
        className={`bg-surface-container-lowest border ${border} rounded-xl px-md py-3 text-on-surface`}
        placeholderTextColor={colors.outline}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        {...rest}
      />
      {error ? (
        <Text className="text-error text-xs">{error}</Text>
      ) : hint ? (
        <Text className="text-on-surface-variant text-xs">{hint}</Text>
      ) : null}
    </View>
  );
}
