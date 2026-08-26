'use client';

import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
import { THEME_OPTIONS, normalizeTheme } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';

export function HomepageThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const theme = useThemeStore((state) => normalizeTheme(state.theme));
  const setTheme = useThemeStore((state) => state.setTheme);
  return <div className="xv-home-theme-switcher">
    {/* The visible label is new; `aria-label` stays because it says what the control
        does rather than what it is, and the swatch beside it is decorative. */}
    <button type="button" className="xv-home-theme-trigger" aria-label="Change homepage theme" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? <X className="h-4 w-4" /> : <AnimatedIcon icon={PaletteIcon} size={16} />}<span className="xv-hc-seg-label">Theme</span><span className={`xv-home-theme-swatch xv-home-theme-swatch--${theme}`} aria-hidden /></button>
    {open && <div className="xv-home-theme-menu" role="radiogroup" aria-label="Choose homepage theme">{THEME_OPTIONS.map((option) => <button key={option.id} type="button" role="radio" aria-checked={theme === option.id} className={theme === option.id ? 'is-active' : undefined} onClick={() => { setTheme(option.id); setOpen(false); }}><span className={`xv-home-theme-swatch xv-home-theme-swatch--${option.id}`} aria-hidden /><strong>{option.label}</strong>{theme === option.id && <Check className="h-3.5 w-3.5" />}</button>)}</div>}
  </div>;
}
