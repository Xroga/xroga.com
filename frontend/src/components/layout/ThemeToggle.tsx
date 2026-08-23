'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { THEME_OPTIONS, normalizeTheme, type CoreThemeId } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  placement?: 'bottom-end' | 'right-start';
}

export function ThemeToggle({ className, placement = 'bottom-end' }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = normalizeTheme(theme);

  const positionMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle(
      placement === 'right-start'
        ? { left: rect.right + 8, top: Math.max(8, rect.top) }
        : { right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 8 },
    );
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const close = () => setOpen(false);
    const reposition = () => positionMenu();
    window.addEventListener('click', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, positionMenu]);

  /* `setTheme` re-derives the terminal skin and clears the slideshow itself. Forcing
     the skin here as well is what made this control disagree with the homepage
     switcher, which only calls `setTheme`: this one worked, that one left the
     workspace on its old skin. */
  const applyTheme = (id: CoreThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          positionMenu();
          setOpen((value) => !value);
        }}
        className="xv-theme-toggle inline-flex h-8 w-8 items-center justify-center rounded-lg glass-panel hover:border-[var(--accent)]/40 transition-colors"
        aria-label="Change theme"
        title="Change theme"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Palette className="w-4 h-4 text-[var(--accent)]" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed w-56 glass-panel-strong rounded-xl p-2 z-[300] shadow-xl border border-[var(--card-border)]"
          style={menuStyle}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)] font-pixel">
            Theme
          </p>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyTheme(opt.id)}
              role="menuitemradio"
              aria-checked={current === opt.id}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
