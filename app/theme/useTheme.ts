import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorName } from './tokens';

export type Theme = {
  dark: boolean;
  scheme: 'light' | 'dark';
  colors: Record<ColorName, string>;
};

// Concrete colors for code that can't use NativeWind classes (tab bar, status
// bar, icon tints). Mirrors the CSS variables in global.css.
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return {
    dark,
    scheme: dark ? 'dark' : 'light',
    colors: dark ? darkColors : lightColors,
  };
}
