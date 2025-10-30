/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#18202F',
          950: '#0C111A',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
      },
    },
  },
  plugins: [],
};

