'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
import { THEME_OPTIONS, normalizeTheme } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';

export function HomepageThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((state) => normalizeTheme(state.theme));
  const setTheme = useThemeStore((state) => state.setTheme);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOutside);
    };
  }, [open]);

  return <div ref={rootRef} className="xv-home-theme-switcher">
    {/* The visible label is new; `aria-label` stays because it says what the control
        does rather than what it is, and the swatch beside it is decorative. */}
    <button type="button" className="xv-home-theme-trigger" aria-label="Change website theme" aria-expanded={open} aria-controls="xv-public-theme-menu" onClick={() => setOpen((value) => !value)}>{open ? <X className="h-4 w-4" /> : <AnimatedIcon icon={PaletteIcon} size={16} />}<span className="xv-hc-seg-label">Theme</span><span className={`xv-home-theme-swatch xv-home-theme-swatch--${theme}`} aria-hidden /></button>
    {open && <div id="xv-public-theme-menu" className="xv-home-theme-menu" role="radiogroup" aria-label="Choose website theme">{THEME_OPTIONS.map((option) => <button key={option.id} type="button" role="radio" aria-checked={theme === option.id} className={theme === option.id ? 'is-active' : undefined} onClick={() => { setTheme(option.id); setOpen(false); }}><span className={`xv-home-theme-swatch xv-home-theme-swatch--${option.id}`} aria-hidden /><strong>{option.label}</strong>{theme === option.id && <Check className="h-3.5 w-3.5" />}</button>)}</div>}
  </div>;
}
