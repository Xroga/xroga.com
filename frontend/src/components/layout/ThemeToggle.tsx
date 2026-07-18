'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Palette } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import {
  DEFAULT_TERMINAL_SKIN,
  SHELL_THEME_OPTIONS,
  THEME_OPTIONS,
  type ThemeId,
} from '@/lib/theme';

export function ThemeToggle() {
  const pathname = usePathname();
  const isShell =
    pathname === '/workspace' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/settings');
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setTerminalSkin = useThemeStore((s) => s.setTerminalSkin);
  const setSlideshowEnabled = useThemeStore((s) => s.setSlideshowEnabled);
  const [open, setOpen] = useState(false);

  const options = isShell ? SHELL_THEME_OPTIONS : THEME_OPTIONS;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const applyTheme = (id: ThemeId) => {
    setTheme(id);
    setTerminalSkin(DEFAULT_TERMINAL_SKIN[id]);
    if (isShell) {
      // Shell never uses photo wallpaper slideshow
      setSlideshowEnabled(false);
    }
    setOpen(false);
  };

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
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyTheme(opt.id)}
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
          {isShell && (
            <p className="mt-2 px-2 pt-2 border-t border-[var(--card-border)]/60 text-[10px] text-[var(--muted)] leading-snug">
              Workspace uses solid deep-work colors — no background photos or slideshow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
