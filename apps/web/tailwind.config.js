/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep teal (primary)
        primary: {
          DEFAULT: '#0D4F4F',
          50: '#E6F3F3',
          100: '#C2E0E0',
          200: '#8FC4C4',
          300: '#5CA7A7',
          400: '#2D8686',
          500: '#126666',
          600: '#0D4F4F',
          700: '#0A3F3F',
          800: '#072F2F',
          900: '#041F1F',
          foreground: '#FFFFFF',
        },
        // Amber (accent)
        accent: {
          DEFAULT: '#D4A017',
          50: '#FBF5E0',
          100: '#F6E8B3',
          200: '#EFD680',
          300: '#E5C04D',
          400: '#D4A017',
          500: '#B88A12',
          600: '#8F6A0E',
          foreground: '#1A1A1A',
        },
      },
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
