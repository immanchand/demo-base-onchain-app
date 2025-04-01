/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Courier New', 'Courier', 'monospace'],
      },
      colors: {
        'primary-bg': 'var(--primary-bg)',
        'primary-border': 'var(--primary-border)',
        'primary-text': 'var(--primary-text)',
        'accent-yellow': 'var(--accent-yellow)',
        'accent-yellow-dark': 'var(--accent-yellow-dark)',
        'success-green': 'var(--success-green)',
        'error-red': 'var(--error-red)',
      },
    },
  },
  plugins: [],
};
