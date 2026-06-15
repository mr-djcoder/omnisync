import type { ReactNode } from 'react';
import { View, Pressable } from 'react-native';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  /** Subtle outlined container vs. a filled surface tier. */
  variant?: 'filled' | 'outlined';
  className?: string;
};

// Rounded surface container used across feeds, lists and forms.
export function Card({ children, onPress, variant = 'filled', className = '' }: Props) {
  const base =
    variant === 'outlined'
      ? 'border border-outline-variant bg-surface-container-low'
      : 'bg-surface-container';
  const classes = `rounded-2xl p-md ${base} ${className}`;

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${classes} active:opacity-80`}>
        {children}
      </Pressable>
    );
  }
  return <View className={classes}>{children}</View>;
}
