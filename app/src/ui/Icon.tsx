import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import type { ColorName } from '../../theme/tokens';

export type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  name: IconName;
  size?: number;
  /** A semantic token name (adapts to light/dark) or an explicit color. */
  color?: ColorName | string;
};

// Vector icon that defaults to the adaptive on-surface color.
export function Icon({ name, size = 22, color = 'on-surface' }: Props) {
  const { colors } = useTheme();
  const resolved = (colors as Record<string, string>)[color] ?? color;
  return <Ionicons name={name} size={size} color={resolved} />;
}
