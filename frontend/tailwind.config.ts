import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-goga)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-source-serif)', 'var(--font-azurio)', 'Georgia', 'serif'],
        azurio: ['var(--font-azurio)', 'Georgia', 'serif'],
        goga: ['var(--font-goga)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        remixa: ['var(--font-remixa)', 'var(--font-goga)', 'system-ui', 'sans-serif'],
        emilio: ['var(--font-emilio)', 'Georgia', 'serif'],
        mono: ['var(--font-xv-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
        pixel: ['var(--font-pixel)', 'Courier New', 'monospace'],
        coding: ['var(--font-pixel)', 'var(--font-xv-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
        claude: ['var(--font-claude-serif)', 'var(--font-source-serif)', 'Georgia', 'serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'gradient-x': 'gradient-x 2s ease infinite',
      },
      backgroundSize: {
        '200': '200% 200%',
      },
    },
  },
  plugins: [],
};
export default config;
