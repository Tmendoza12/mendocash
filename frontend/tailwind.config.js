/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e7f8f5',
          100: '#d7f2ed',
          200: '#b0e6dc',
          300: '#7cd9c9',
          400: '#47c9b4',
          500: '#10a992',
          600: '#0c907c',
          700: '#08766e',
          800: '#075e5c',
          900: '#064c4d',
        },
        accent: '#47c9b4',
        navy: {
          100: '#cfe2e2',
          200: '#a7c6c6',
          300: '#77919a',
          400: '#3a6a6d',
          500: '#075e5c',
          600: '#064c4d',
          700: '#033739',
          800: '#022a2c',
          900: '#021c1e',
        },
        ink: {
          DEFAULT: '#073d46',
          soft: '#77919a',
          text: '#315f6c',
        },
        mist: '#f1f7f8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      borderRadius: {
        xl2: '15px',
      },
      boxShadow: {
        soft: '0 8px 25px rgba(5, 65, 72, 0.07)',
        'soft-hover': '0 14px 32px rgba(5, 65, 72, 0.12)',
      },
    },
  },
  plugins: [],
};
