/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Палитра, вдохновлённая kzn.ru / флагом Татарстана
        kzn: {
          green: '#006a44',      // основной тёмно-зелёный
          'green-dark': '#004c30',
          'green-light': '#1f8a5c',
          red: '#d0021b',        // акцентный красный
          'red-dark': '#9b0014',
          cream: '#f6f1e5',      // тёплый бежевый фон
          sand: '#ece3cc',
          ink: '#1a1a1a',
          muted: '#6b6b6b',
          line: '#d9d2bf',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};
