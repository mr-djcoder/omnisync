const { colors, spacing, fontFamily } = require('./theme/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: { colors, spacing, fontFamily },
  },
  plugins: [],
};
