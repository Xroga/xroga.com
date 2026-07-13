'use client';

import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { THEME_OPTIONS } from '@/lib/theme';
import { SlideshowToggle } from '@/components/layout/SlideshowToggle';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg glass-panel hover:border-[var(--accent)]/40 transition-colors"
        aria-label="Change theme"
      >
        <Palette className="w-4 h-4 text-[var(--accent)]" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 glass-panel-strong rounded-xl p-2 z-[250] shadow-xl border border-[var(--card-border)]">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setTheme(opt.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                theme === opt.id
                  ? 'bg-[var(--primary)]/30 text-[var(--accent)]'
                  : 'hover:bg-white/5 text-[var(--muted)]'
              }`}
            >
              <span className="font-medium block">{opt.label}</span>
              <span className="text-xs opacity-70">{opt.description}</span>
            </button>
          ))}
          <div className="mt-2 pt-2 border-t border-[var(--card-border)]/60 px-1">
            <SlideshowToggle compact className="w-full justify-center" />
          </div>
        </div>
      )}
    </div>
  );
}
