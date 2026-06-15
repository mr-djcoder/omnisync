import { useColorScheme } from 'nativewind';
import { darkColors, lightColors, type ColorName } from './tokens';

export type Theme = {
  dark: boolean;
  scheme: 'light' | 'dark';
  colors: Record<ColorName, string>;
};

// Concrete colors for code that can't use NativeWind classes (tab bar, status
// bar, icon tints). Tracks NativeWind's colorScheme so it respects the manual
// light/dark override from ThemeProvider as well as the OS scheme.
export function useTheme(): Theme {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  return {
    dark,
    scheme: dark ? 'dark' : 'light',
    colors: dark ? darkColors : lightColors,
  };
}
