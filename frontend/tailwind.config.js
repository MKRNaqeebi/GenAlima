/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        surface: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#0f172a',
        },
        chat: {
          bg: '#212121',
          sidebar: '#171717',
          surface: '#2f2f2f',
          hover: '#3f3f3f',
          border: '#404040',
          user: '#343541',
          assistant: '#444654',
          text: {
            primary: '#ffffff',
            secondary: '#c5c5d2',
            muted: '#8e8ea0',
          }
        }
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}

