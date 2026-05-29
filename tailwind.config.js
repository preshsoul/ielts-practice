/** @type {import('tailwindcss').Config} */
function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variableName}) / ${opacityValue})`;
    }
    return `rgb(var(${variableName}))`;
  };
}

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        border: withOpacity('--border-rgb'),
        input: withOpacity('--input-rgb'),
        ring: withOpacity('--ring-rgb'),
        background: withOpacity('--background-rgb'),
        foreground: withOpacity('--foreground-rgb'),
        primary: {
          DEFAULT: withOpacity('--primary-rgb'),
          foreground: withOpacity('--primary-foreground-rgb'),
        },
        secondary: {
          DEFAULT: withOpacity('--secondary-rgb'),
          foreground: withOpacity('--secondary-foreground-rgb'),
        },
        destructive: {
          DEFAULT: withOpacity('--destructive-rgb'),
          foreground: withOpacity('--destructive-foreground-rgb'),
        },
        muted: {
          DEFAULT: withOpacity('--muted-rgb'),
          foreground: withOpacity('--muted-foreground-rgb'),
        },
        accent: {
          DEFAULT: withOpacity('--accent-rgb'),
          foreground: withOpacity('--accent-foreground-rgb'),
        },
        popover: {
          DEFAULT: withOpacity('--popover-rgb'),
          foreground: withOpacity('--popover-foreground-rgb'),
        },
        card: {
          DEFAULT: withOpacity('--card-rgb'),
          foreground: withOpacity('--card-foreground-rgb'),
        },
        loci: {
          bg: '#F4F0E8',
          surface: '#FCFAF6',
          border: '#DDD4C8',
          text: '#171512',
          muted: '#61574F',
          faint: '#F1EBE2',
          accent: '#1F4FD1',
          green: '#146B3E',
          red: '#A72828',
          amber: '#8B5408',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Geist Variable', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
