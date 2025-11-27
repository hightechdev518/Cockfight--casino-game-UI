/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'casino-dark': '#0a0e27',
        'casino-darker': '#050812',
        'casino-gold': '#ffd700',
        'casino-gold-dark': '#ffb800',
        'casino-green': '#00ff88',
        'casino-red': '#ff4444',
      },
    },
  },
  plugins: [],
}

