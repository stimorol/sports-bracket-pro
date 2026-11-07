/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#ea580c', // Orange-600 for better WCAG contrast
        primaryHover: '#c2410c', // Orange-700
        secondary: '#44403c', // Stone-700
        accent: '#d97706', // Amber-600
        neutral: '#57534e', // Stone-600
        light: '#fafaf9', // Stone-50
      },
    },
  },
  plugins: [],
};
