// Design tokens — single source of truth for color, spacing and type.
//
// Color works in two layers:
//  - The semantic NAMES below (primary, background, on-surface, …) are the
//    contract every screen uses via NativeWind classes (bg-background, …).
//  - Light/dark VALUES live as CSS variables in global.css; NativeWind swaps
//    them automatically with the system color scheme. The hex maps here are the
//    JS-side mirror, used by code that needs a concrete color (tab bar, status
//    bar, icon tints) via the useTheme() hook.

export const darkColors = {
  primary: '#ddb7ff',
  'primary-container': '#b76dff',
  'on-primary': '#490080',
  'on-primary-container': '#f0dbff',
  secondary: '#4cd7f6',
  'secondary-container': '#00788c',
  'on-secondary': '#003640',
  tertiary: '#fabc4e',
  background: '#16111b',
  surface: '#16111b',
  'surface-container-lowest': '#110c15',
  'surface-container-low': '#1f1a23',
  'surface-container': '#231e27',
  'surface-container-high': '#2e2832',
  'surface-container-highest': '#39323d',
  'on-surface': '#eadfed',
  'on-surface-variant': '#cfc2d6',
  outline: '#988d9f',
  'outline-variant': '#4d4354',
  error: '#ffb4ab',
  'on-error': '#690005',
  success: '#7ce0a3',
} as const;

export const lightColors = {
  primary: '#7c3aed',
  'primary-container': '#ecd9ff',
  'on-primary': '#ffffff',
  'on-primary-container': '#2c0051',
  secondary: '#0e7490',
  'secondary-container': '#cbeef9',
  'on-secondary': '#ffffff',
  tertiary: '#8a5a00',
  background: '#fdf7ff',
  surface: '#fdf7ff',
  'surface-container-lowest': '#ffffff',
  'surface-container-low': '#f8f1fb',
  'surface-container': '#f2ebf6',
  'surface-container-high': '#ece4f1',
  'surface-container-highest': '#e6deec',
  'on-surface': '#1d1a20',
  'on-surface-variant': '#4a454e',
  outline: '#7b757f',
  'outline-variant': '#ccc4cf',
  error: '#ba1a1a',
  'on-error': '#ffffff',
  success: '#1f7a4d',
} as const;

// Backwards-compatible alias: dark is the brand baseline.
export const colors = darkColors;

export type ColorName = keyof typeof darkColors;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  gutter: '16px',
  lg: '24px',
  xl: '40px',
} as const;

export const fontFamily = {
  sans: ['Inter', 'system-ui', 'sans-serif'],
} as const;

// Semantic color names that map to the CSS variables defined in global.css.
export const colorNames = Object.keys(darkColors) as ColorName[];
