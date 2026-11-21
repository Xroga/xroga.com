'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const current = normalizeTheme(theme);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    optionsRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open]);

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      close();
      buttonRef.current?.focus({ preventScroll: true });
      return;
    }
    const items = Array.from(optionsRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % items.length
        : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : undefined;
    if (next === undefined || !items.length) return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus({ preventScroll: true });
  };

  /* `setTheme` re-derives the terminal skin and clears the slideshow itself. Forcing
     the skin here as well is what made this control disagree with the homepage
     switcher, which only calls `setTheme`: this one worked, that one left the
     workspace on its old skin. */
  const applyTheme = (id: CoreThemeId) => {
    setTheme(id);
    close();
    buttonRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={cn('relative', className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }}
        className="xv-theme-toggle inline-flex h-8 w-8 items-center justify-center rounded-lg glass-panel hover:border-[var(--accent)]/40 transition-colors"
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {/* The outline draws itself and the four inks land in sequence — the picture
            of a palette being loaded, which is what choosing a theme is. */}
        <AnimatedIcon icon={PaletteIcon} className="text-[var(--accent)]" />
      </button>
      <AnchoredPortalPopover open={open} onClose={close} anchorRef={buttonRef} placement={placement} width={224} ariaLabel="Theme"
        className="glass-panel-strong rounded-xl p-2 shadow-xl border border-[var(--card-border)]">
        <div ref={optionsRef} onKeyDown={navigate}
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
              tabIndex={current === opt.id ? 0 : -1}
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
      </AnchoredPortalPopover>
    </div>
  );
}
