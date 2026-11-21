/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        rail: {
          50: "#eef6ff",
          100: "#d9ebff",
          500: "#1d6fdb",
          600: "#175bb3",
          700: "#134a90",
        },
      },
    },
  },
  plugins: [],
};
