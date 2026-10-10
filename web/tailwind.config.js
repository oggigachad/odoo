/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        skyline: {
          navy: "#0F172A",
          accent: "#0EA5E9",
          success: "#16A34A",
          warning: "#D97706",
          danger: "#DC2626",
          surface: "#FFFFFF",
          muted: "#475569",
        },
      },
    },
  },
  plugins: [],
};
