/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dremio dark navy sidebar palette
        navy: {
          950: '#060d18',
          900: '#0c1929',
          800: '#132035',
          700: '#1a2d47',
          600: '#243d5e',
          500: '#2f5080',
        },
        // Dremio accent blue
        dblue: {
          50:  '#e6f5ff',
          400: '#4bb3fd',
          500: '#00a3ff',
          600: '#0088e0',
        },
        // Dremio UI grays
        surface: {
          50:  '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1e9',
          300: '#c4cad6',
          400: '#8f9db5',
          500: '#5a6a82',
          600: '#3d4f66',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
