/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: {
      xs: '320px',
      sm: '390px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Colores primarios configurables por tenant
        // Se sobreescriben desde el ThemeContext con CSS variables
        primary: {
          50:  'rgb(var(--p50)  / <alpha-value>)',
          100: 'rgb(var(--p100) / <alpha-value>)',
          200: 'rgb(var(--p200) / <alpha-value>)',
          300: 'rgb(var(--p300) / <alpha-value>)',
          400: 'rgb(var(--p400) / <alpha-value>)',
          500: 'rgb(var(--p500) / <alpha-value>)',
          600: 'rgb(var(--p600) / <alpha-value>)',
          700: 'rgb(var(--p700) / <alpha-value>)',
          800: 'rgb(var(--p800) / <alpha-value>)',
          900: 'rgb(var(--p900) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
