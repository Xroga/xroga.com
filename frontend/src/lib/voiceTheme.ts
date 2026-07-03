import type { CSSProperties } from 'react';
import type { ThemeId } from '@/lib/theme';

/** Voice overlay CSS variables — mirrors dashboard theme selection */
export const VOICE_THEME_VARS: Record<ThemeId, CSSProperties & Record<string, string>> = {
  image: {
    '--background': '#0a0e17',
    '--foreground': '#ffffff',
    '--muted': '#b8c6e0',
    '--accent': '#4a7aff',
    '--primary-glow': '#6b9fff',
    '--card-border': 'rgba(74, 122, 255, 0.25)',
    '--voice-glass': 'rgba(10, 14, 23, 0.72)',
    '--voice-glass-border': 'rgba(74, 122, 255, 0.22)',
  },
  white: {
    '--background': '#f8fafc',
    '--foreground': '#0f172a',
    '--muted': '#475569',
    '--accent': '#2563eb',
    '--primary-glow': '#60a5fa',
    '--card-border': 'rgba(37, 99, 235, 0.2)',
    '--voice-glass': 'rgba(255, 255, 255, 0.82)',
    '--voice-glass-border': 'rgba(37, 99, 235, 0.18)',
  },
  black: {
    '--background': '#000000',
    '--foreground': '#ffffff',
    '--muted': '#94a3b8',
    '--accent': '#4a7aff',
    '--primary-glow': '#6b9fff',
    '--card-border': 'rgba(74, 122, 255, 0.3)',
    '--voice-glass': 'rgba(0, 0, 0, 0.75)',
    '--voice-glass-border': 'rgba(74, 122, 255, 0.25)',
  },
  gray: {
    '--background': '#1a1a1a',
    '--foreground': '#f1f5f9',
    '--muted': '#94a3b8',
    '--accent': '#4a7aff',
    '--primary-glow': '#6b9fff',
    '--card-border': 'rgba(148, 163, 184, 0.2)',
    '--voice-glass': 'rgba(26, 26, 26, 0.78)',
    '--voice-glass-border': 'rgba(148, 163, 184, 0.18)',
  },
};

export function voiceThemeStyle(theme: ThemeId): CSSProperties {
  return VOICE_THEME_VARS[theme] ?? VOICE_THEME_VARS.image;
}
