/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#dceeff',
          200: '#bedfff',
          300: '#91c9ff',
          400: '#5aa9fa',
          500: '#3589ed',
          600: '#256fd5',
          700: '#2059ad',
          800: '#214b8a',
          900: '#203f70',
        },
        accent: {
          50: '#ecfdf5', 200: '#a7f3d0', 500: '#10b981', 600: '#059669', 700: '#047857',
        },
        warning: {
          50: '#fffbeb', 200: '#fde68a', 500: '#f59e0b', 700: '#b45309',
        },
        danger: {
          50: '#fef2f2', 200: '#fecaca', 500: '#ef4444', 700: '#b91c1c',
        },
        info: {
          50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f4f8',
          200: '#e5eaf0',
          300: '#cfd7e2',
          400: '#8d99a8',
          500: '#687587',
          600: '#4d596a',
          700: '#354152',
          800: '#222d3d',
          900: '#172131',
          950: '#0d1624',
        },
        canvas: '#f7f9fc',
        paper: '#ffffff',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        display: ['Iowan Old Style', 'Baskerville', 'Songti SC', 'STSong', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,22,36,.03), 0 8px 24px rgba(13,22,36,.045)',
        'card-hover': '0 2px 4px rgba(13,22,36,.04), 0 14px 34px rgba(38,89,150,.10)',
      },
      keyframes: {
        'page-enter': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flash: {
          '0%': { backgroundColor: 'rgba(53,137,237,.16)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'page-enter': 'page-enter 360ms ease-out both',
        flash: 'flash 800ms ease-out',
      },
    },
  },
  plugins: [],
};
