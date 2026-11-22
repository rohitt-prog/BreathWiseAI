/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          page: '#f5f7fa',
          card: '#ffffff',
          raised: '#eceff4',
          dark: {
            page: '#0b0d14',
            card: '#11141c',
            raised: '#1a1e28',
          }
        },
        aqi: {
          good: '#16A34A',          // 0 - 50 (Green)
          satisfactory: '#65A30D',  // 51 - 100 (Lime)
          moderate: '#CA8A04',      // 101 - 200 (Amber/Yellow)
          poor: '#EA580C',          // 201 - 300 (Orange)
          verypoor: '#DC2626',      // 301 - 400 (Red)
          severe: '#7F1D1D',        // 401 - 500 (Crimson/Maroon)
        },
        brand: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          900: '#064E3B',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
