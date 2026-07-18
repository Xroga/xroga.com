'use client';

import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import {
  THEME_OPTIONS,
  normalizeTheme,
  skinForTheme,
  type CoreThemeId,
} from '@/lib/theme';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setTerminalSkin = useThemeStore((s) => s.setTerminalSkin);
  const setSlideshowEnabled = useThemeStore((s) => s.setSlideshowEnabled);
  const [open, setOpen] = useState(false);
  const current = normalizeTheme(theme);
  const currentLabel = THEME_OPTIONS.find((o) => o.id === current)?.label ?? 'White';

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const applyTheme = (id: CoreThemeId) => {
    setTheme(id);
    setTerminalSkin(skinForTheme(id));
    setSlideshowEnabled(false);
    setOpen(false);
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg glass-panel hover:border-[var(--accent)]/40 transition-colors"
        aria-label="Change theme"
        title={`Theme: ${currentLabel}`}
      >
        <Palette className="w-4 h-4 text-[var(--accent)]" />
        <span className="hidden md:inline text-[10px] font-coding text-[var(--foreground)] opacity-80">
          {currentLabel}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 glass-panel-strong rounded-xl p-2 z-[250] shadow-xl border border-[var(--card-border)]">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)] font-pixel">
            Theme
          </p>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyTheme(opt.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                current === opt.id
                  ? 'bg-[var(--accent-dim)] text-[var(--foreground)]'
                  : 'hover:bg-[var(--foreground)]/5 text-[var(--muted)]'
              }`}
            >
              <span className="font-medium block font-claude">{opt.label}</span>
              <span className="text-xs opacity-70 font-coding">{opt.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
