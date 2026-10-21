/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#f3eee8',
          raised: '#faf5ef',
          cream: '#efe7de',
        },
        ink: {
          DEFAULT: '#536578',
          body: '#536170',
          strong: '#3f5263',
          muted: '#586470',
        },
        primary: {
          DEFAULT: '#3a726d',
          text: '#2d6560',
          soft: 'rgba(58,114,109,.18)',
          50: '#eef5f4',
          100: '#d7e9e6',
          200: '#b0d3ce',
          300: '#89bdb6',
          400: '#5ca19a',
          500: '#3a726d',
          600: '#2d5955',
          700: '#234845',
          800: '#1a3635',
          900: '#112524',
          foreground: '#faf5ef',
        },
        accent: {
          DEFAULT: '#c9a86a',
          text: '#8b7340',
          soft: 'rgba(201,168,106,.16)',
          50: '#faf6ed',
          100: '#f3e9d0',
          200: '#e8d5a8',
          300: '#dcc180',
          400: '#c9a86a',
          500: '#b08f52',
          600: '#8b7340',
          700: '#6b5832',
          800: '#4b3e23',
          900: '#2b2414',
          foreground: '#3f5263',
        },
        tint: {
          sage: '#dcebe0',
          blue: '#dfeaf4',
          lavender: '#eae2f2',
          peach: '#f5e1d8',
          teal: '#d7e9e6',
        },
        ok: {
          DEFAULT: '#3a8a5c',
          text: '#2d6b47',
          soft: 'rgba(58,138,92,.12)',
        },
        warning: {
          DEFAULT: '#c6913a',
          text: '#8b6a2f',
          soft: 'rgba(198,145,58,.12)',
        },
        danger: {
          DEFAULT: '#c4453e',
          text: '#a23832',
          soft: 'rgba(196,69,62,.12)',
        },
        border: {
          DEFAULT: 'rgba(83,101,120,.13)',
          strong: 'rgba(83,101,120,.22)',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(83,101,120,.06), 0 4px 14px rgba(83,101,120,.04)',
        lift: '0 4px 16px rgba(83,101,120,.10), 0 8px 28px rgba(83,101,120,.05)',
      },
      spacing: {
        sidebar: '264px',
      },
    },
  },
  plugins: [],
}
