'use client';

import { useEffect, useState } from 'react';

type Tip = { label: string; top: number; left: number };

/** A short, time-limited hint for icon controls throughout the signed-in app. */
export function CompactAppTooltip({ enabled }: { enabled: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active: HTMLElement | null = null;
    let savedTitle: string | null = null;
    let addedAria = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    function clearTimers() {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    }

    function close() {
      clearTimers();
      setTip(null);
      if (active && savedTitle !== null) active.setAttribute('title', savedTitle);
      if (active && addedAria) active.removeAttribute('aria-label');
      active = null;
      savedTitle = null;
      addedAria = false;
    }

    function controlFor(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null;
      const control = target.closest<HTMLElement>('button, a, [role="button"]');
      if (!control || control.closest('.xv-hover-tip-wrap, .xv-sidebar-nav-v2, .xv-sidebar-collapsed-actions, .xv-sidebar-hover-menu')) return null;
      if (control.matches(':disabled')) return null;
      return control;
    }

    function open(target: EventTarget | null) {
      const control = controlFor(target);
      if (!control || control === active) return;
      close();
      const fullLabel = control.getAttribute('data-short-tip') || control.getAttribute('title') || control.getAttribute('aria-label');
      if (!fullLabel) return;
      const words = fullLabel.trim().replace(/[—–·,:;.!?]+/g, ' ').split(/\s+/).filter(Boolean);
      if (!words.length) return;
      const label = words.slice(0, 2).join(' ');
      active = control;
      savedTitle = control.getAttribute('title');
      if (savedTitle !== null) {
        control.removeAttribute('title');
        if (!control.hasAttribute('aria-label')) {
          control.setAttribute('aria-label', savedTitle);
          addedAria = true;
        }
      }
      showTimer = setTimeout(() => {
        if (active !== control) return;
        const rect = control.getBoundingClientRect();
        const width = Math.min(180, label.length * 7 + 20);
        setTip({
          label,
          left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
          top: rect.top > 40 ? rect.top - 32 : rect.bottom + 8,
        });
        dismissTimer = setTimeout(() => setTip(null), 4_000);
      }, 200);
    }

    function onPointerOut(event: PointerEvent) {
      if (!active || !(event.target instanceof Node) || !active.contains(event.target)) return;
      if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
      close();
    }

    function onFocusOut(event: FocusEvent) {
      if (!active || !(event.target instanceof Node) || !active.contains(event.target)) return;
      if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
      close();
    }

    const onPointerOver = (event: PointerEvent) => open(event.target);
    const onFocusIn = (event: FocusEvent) => {
      if (controlFor(event.target)?.matches(':focus-visible')) open(event.target);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      close();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [enabled]);

  return tip ? <span role="tooltip" className="xv-compact-app-tooltip" style={{ top: tip.top, left: tip.left }}>{tip.label}</span> : null;
}
