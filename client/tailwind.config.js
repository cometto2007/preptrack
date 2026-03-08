/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2b8cee',
        'primary-dark': '#1a6fca',
        'accent-teal': '#14b8a6',
        'bg-app': '#101922',
        'bg-card': 'rgb(30 41 59 / 0.5)', // slate-800/50
        'bg-surface': '#1e2a38',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
