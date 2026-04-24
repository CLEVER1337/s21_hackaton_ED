/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Основная палитра проекта:
        // navy #0B2444, blue #1354A3, sky #39A8E0, light #E8F2FB, white #FFFFFF
        brand: {
          navy: '#0B2444',
          blue: '#1354A3',
          'blue-dark': '#0B2444',
          sky: '#39A8E0',
          light: '#E8F2FB',
          surface: '#FFFFFF',
          ink: '#0B2444',
          muted: '#5B6B80',
          line: '#C5DCF2',
          // акценты для состояний
          error: '#C53030',
          'error-dark': '#9B2C2C',
          success: '#1F8A5C',
          warning: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(11,36,68,0.06), 0 4px 12px rgba(11,36,68,0.06)',
      },
    },
  },
  plugins: [],
};
