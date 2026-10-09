/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F3F4F9',
        card: '#FFFFFF',
        ink: '#12141F',
        muted: '#6B7085',
        line: '#E2E4EE',
        career: '#4F46E5',
        money: '#0F9D6B',
        curiosity: '#E08A00',
        personal: '#D6336C',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '20px' },
      boxShadow: {
        lift: '0 1px 2px rgba(18,20,31,.04), 0 8px 24px -12px rgba(18,20,31,.12)',
      },
    },
  },
  plugins: [],
};
