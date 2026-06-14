// Design tokens — single source of truth, consumed by tailwind.config.js and RN code.
export const colors = {
  primary: '#ddb7ff',
  'primary-container': '#b76dff',
  'on-primary': '#490080',
  secondary: '#4cd7f6',
  'secondary-container': '#03b5d3',
  background: '#16111b',
  surface: '#16111b',
  'surface-container': '#231e27',
  'surface-container-low': '#1f1a23',
  'surface-container-lowest': '#110c15',
  'on-surface': '#eadfed',
  'on-surface-variant': '#cfc2d6',
  outline: '#988d9f',
  'outline-variant': '#4d4354',
  error: '#ffb4ab',
  tertiary: '#fabc4e',
} as const;

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
