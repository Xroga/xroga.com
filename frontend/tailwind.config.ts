import type { Config } from "tailwindcss";
import { TERMINAL_SKINS } from "./src/lib/theme";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  /**
   * The terminal skin classes live in `@layer utilities` and are composed at runtime
   * as `terminal-skin-${skin}`, so Tailwind's scanner never sees them literally and
   * strips every rule whose name does not also appear somewhere in source. That is
   * how five new skins shipped as dead CSS once already.
   *
   * Deriving the list from the catalogue rather than hardcoding it means adding a
   * skin cannot reintroduce the bug — there is no second place to remember to edit.
   */
  safelist: TERMINAL_SKINS.map((skin) => `terminal-skin-${skin.id}`),
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
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
      },
      boxShadow: {
        subtle: 'var(--shadow-subtle)',
        elevated: 'var(--shadow-elevated)',
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
