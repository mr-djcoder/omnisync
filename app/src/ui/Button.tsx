import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import type { IconName } from './Icon';

type Variant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
};

const container: Record<Variant, string> = {
  primary: 'bg-primary',
  tonal: 'bg-primary-container',
  outline: 'border border-outline bg-transparent',
  ghost: 'bg-transparent',
  danger: 'border border-error bg-transparent',
};

const label: Record<Variant, string> = {
  primary: 'text-on-primary',
  tonal: 'text-on-primary-container',
  outline: 'text-on-surface',
  ghost: 'text-primary',
  danger: 'text-error',
};

export function Button({
  label: text,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  className = '',
}: Props) {
  const { colors } = useTheme();
  const tint: Record<Variant, string> = {
    primary: colors['on-primary'],
    tonal: colors['on-primary-container'],
    outline: colors['on-surface'],
    ghost: colors.primary,
    danger: colors.error,
  };
  const pad = size === 'lg' ? 'py-4 px-6' : 'py-3 px-5';
  const isOff = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      className={`flex-row items-center justify-center gap-sm rounded-full ${pad} ${container[variant]} ${
        fullWidth ? 'w-full' : 'self-start'
      } ${isOff ? 'opacity-50' : 'active:opacity-80'} ${className}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint[variant]} />
      ) : (
        <View className="flex-row items-center gap-sm">
          {icon ? <Ionicons name={icon} size={18} color={tint[variant]} /> : null}
          <Text className={`font-semibold ${label[variant]}`}>{text}</Text>
        </View>
      )}
    </Pressable>
  );
}
