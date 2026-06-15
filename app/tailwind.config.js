const { spacing, fontFamily } = require('./theme/tokens');

// Semantic color names map to the CSS variables in global.css, so a single set
// of class names (bg-background, text-on-surface, …) adapts to light/dark.
const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

const colors = {
  primary: color('primary'),
  'primary-container': color('primary-container'),
  'on-primary': color('on-primary'),
  'on-primary-container': color('on-primary-container'),
  secondary: color('secondary'),
  'secondary-container': color('secondary-container'),
  'on-secondary': color('on-secondary'),
  tertiary: color('tertiary'),
  background: color('background'),
  surface: color('surface'),
  'surface-container-lowest': color('surface-container-lowest'),
  'surface-container-low': color('surface-container-low'),
  'surface-container': color('surface-container'),
  'surface-container-high': color('surface-container-high'),
  'surface-container-highest': color('surface-container-highest'),
  'on-surface': color('on-surface'),
  'on-surface-variant': color('on-surface-variant'),
  outline: color('outline'),
  'outline-variant': color('outline-variant'),
  error: color('error'),
  'on-error': color('on-error'),
  success: color('success'),
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      spacing,
      fontFamily,
      borderRadius: { xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem' },
    },
  },
  plugins: [],
};
