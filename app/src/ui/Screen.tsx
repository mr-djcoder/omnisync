import type { ReactNode } from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Horizontal padding via the md gutter. */
  padded?: boolean;
  className?: string;
  contentClassName?: string;
};

// Background + safe-area aware page wrapper. Adapts via bg-background.
export function Screen({
  children,
  scroll = false,
  padded = true,
  className = '',
  contentClassName = '',
}: Props) {
  const insets = useSafeAreaInsets();
  const pad = padded ? 'px-md' : '';

  if (scroll) {
    return (
      <View className={`flex-1 bg-background ${className}`} style={{ paddingTop: insets.top }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View className={`${pad} ${contentClassName}`}>{children}</View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      className={`flex-1 bg-background ${pad} ${className}`}
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {children}
    </View>
  );
}
