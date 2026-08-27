'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { TERMINAL_SKINS, type TerminalSkin } from '@/lib/theme';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

/**
 * The terminal's skin picker.
 *
 * A menu rather than the cycle button this replaces: with ten skins, a blind cycle
 * makes the user click nine times to see the tenth and gives no way back. The menu
 * shows every option, its swatch, and which one is active.
 *
 * "Match theme" is listed first and is the state new users start in — picking any
 * named skin is what opts them out of automatic tracking, so the coupling that made
 * the terminal change under people is never re-established by accident.
 */
export function TerminalSkinPicker() {
  const skin = useThemeStore((s) => s.terminalSkin);
  const auto = useThemeStore((s) => s.terminalSkinAuto);
  const setSkin = useThemeStore((s) => s.setTerminalSkin);
  const setAuto = useThemeStore((s) => s.setTerminalSkinAuto);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a popover that only closes by re-clicking
  // its trigger is a trap on touch, where there is no hover affordance to hint at it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = TERMINAL_SKINS.find((s) => s.id === skin) ?? TERMINAL_SKINS[0];

  function choose(id: TerminalSkin) {
    setSkin(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="xv-skin-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Terminal skin"
      >
        <AnimatedIcon icon={PaletteIcon} size={14} intro={false} />
        <span className="xv-skin-trigger-label">{auto ? 'Auto' : active.label}</span>
        <span
          aria-hidden="true"
          className="xv-skin-dot"
          style={{ background: active.swatch[0], borderColor: active.swatch[2] }}
        />
      </button>

      {open && (
        <div className="xv-skin-menu" role="menu" aria-label="Terminal skin">
          <div className="xv-skin-menu-head">
            <span>Terminal appearance</span>
            <small>Choose a modern console palette</small>
          </div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={auto}
            onClick={() => {
              setAuto();
              setOpen(false);
            }}
            className={cn('xv-skin-item', auto && 'is-active')}
          >
            <span className="xv-skin-swatch xv-skin-swatch--auto" aria-hidden="true" />
            <span className="xv-skin-name">Match theme</span>
            {auto && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
          </button>

          <div className="xv-skin-sep" role="separator" />

          {TERMINAL_SKINS.map((spec) => {
            const isActive = !auto && spec.id === skin;
            return (
              <button
                key={spec.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => choose(spec.id)}
                className={cn('xv-skin-item', isActive && 'is-active')}
              >
                <span
                  aria-hidden="true"
                  className="xv-skin-swatch"
                  style={{ background: spec.swatch[0], borderColor: spec.swatch[2] }}
                >
                  <i style={{ background: spec.swatch[1] }} />
                  <i style={{ background: spec.swatch[2] }} />
                </span>
                <span className="xv-skin-name">{spec.label}</span>
                {isActive && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
