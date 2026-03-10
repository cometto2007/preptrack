/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#4d8ff7',
        'primary-dark': '#2f72dd',
        'accent-teal': '#14b8a6',
        'bg-app': '#22364f',
        'bg-card': '#0c1724',
        'bg-surface': '#1f3249',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
