/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effbfa',
          100: '#d8f5f3',
          200: '#b3ebe8',
          300: '#86dfdb',
          400: '#6fd4d1',
          500: '#5BC0BE',
          600: '#47a5a3',
          700: '#3a8785',
          800: '#2b6a69',
          900: '#1f4d4c',
        },
        accent: '#6FFFE9',
        navy: {
          100: '#c7d0e2',
          200: '#9aa8c4',
          300: '#3A506B',
          400: '#2a3d55',
          500: '#1C2541',
          600: '#16203a',
          700: '#0B132B',
          800: '#080f22',
          900: '#050a18',
        },
      },
    },
  },
  plugins: [],
};
