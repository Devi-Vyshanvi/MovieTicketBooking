/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f8f0e3',
          100: '#ecd9bb',
          200: '#d9b886',
          300: '#b88a4e',
          400: '#9b6f37',
          500: '#7c572b',
          600: '#624423',
          700: '#47301a',
          800: '#2f2012',
          900: '#1c1209',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', 'Avenir Next', 'Segoe UI', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        glow: '0 22px 45px rgba(0, 0, 0, 0.35)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 220ms ease',
      },
    },
  },
  plugins: [],
}

