'use client';

import { Check, Palette } from 'lucide-react';
import { THEME_OPTIONS, normalizeTheme } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';

export function HomepageThemeSwitcher() {
  const theme = useThemeStore((state) => normalizeTheme(state.theme));
  const setTheme = useThemeStore((state) => state.setTheme);
  return (
    <div className="xv-home-theme-switcher" aria-label="Homepage theme">
      <span className="xv-home-theme-title"><Palette className="h-3.5 w-3.5" /> Theme</span>
      <div role="radiogroup" aria-label="Choose homepage theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={theme === option.id}
            className={theme === option.id ? 'is-active' : undefined}
            onClick={() => setTheme(option.id)}
            title={`${option.label}: ${option.description}`}
          >
            <span className={`xv-home-theme-swatch xv-home-theme-swatch--${option.id}`} aria-hidden />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
            {theme === option.id ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
