'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { XrogaCompanion } from './XrogaCompanion';
import { useCompanionStore } from '@/store/useCompanionStore';

interface Position { left: number; top: number }

export function HomepageCompanionStage() {
  const [position, setPosition] = useState<Position | null>(null);
  /* `end` runs on pointerup and used to read `position` straight from the render
     closure, which was still null at that moment — so a drag moved Smoky on screen
     and then never saved it. The ref always holds the latest value. */
  const positionRef = useRef<Position | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('xroga-smoky-position');
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as Position;
      if (Number.isFinite(value.left) && Number.isFinite(value.top)) {
        setPosition(value);
        positionRef.current = value;
      }
    } catch { localStorage.removeItem('xroga-smoky-position'); }
  }, []);

  /**
   * Dragging is driven by window listeners, not pointer capture.
   *
   * Capture looks like the right tool and is a trap here: while a pointer is
   * captured the following `click` is retargeted to the capturing element, so every
   * click on Smoky landed on this stage instead of the button inside it. That was
   * invisible while the character was decorative and had nothing to click, and broke
   * the moment it gained a handler. Moving the capture later fixed the click but then
   * `pointerup` stopped arriving, so the position was never saved — one bug traded
   * for another.
   *
   * Window listeners avoid both: the click is never retargeted, and pointerup is
   * caught even when the cursor has left the element.
   */
  function start(event: React.PointerEvent<HTMLDivElement>) {
    if (!(event.target as Element).closest('.xv-companion-trigger')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };

    const onMove = (moveEvent: PointerEvent) => {
      if (!drag.current) return;
      const dx = moveEvent.clientX - drag.current.x;
      const dy = moveEvent.clientY - drag.current.y;
      // Below the threshold this is still a click, so nothing moves yet.
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.current.moved = true;
      if (!drag.current.moved) return;
      const left = Math.max(8, Math.min(window.innerWidth - 112, drag.current.left + dx));
      const top = Math.max(72, Math.min(window.innerHeight - 130, drag.current.top + dy));
      positionRef.current = { left, top };
      setPosition({ left, top });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (drag.current?.moved && positionRef.current) {
        localStorage.setItem('xroga-smoky-position', JSON.stringify(positionRef.current));
      }
      // Cleared on the next task so the click that follows this pointerup can still
      // see `moved` and suppress itself.
      window.setTimeout(() => { drag.current = null; }, 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return <div className="xv-home-companion-stage" style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined} onPointerDown={start} onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }}><XrogaCompanion variant="hero" /></div>;
}

export function CompanionGlobalDock() {
  const pathname = usePathname();
  const dock = useCompanionStore((state) => state.dock);
  const appSurface = pathname.startsWith('/dashboard') || pathname.startsWith('/settings');
  const workspaceCorner = pathname.startsWith('/workspace') && dock === 'corner';
  if (!appSurface && !workspaceCorner) return null;
  return <XrogaCompanion variant="floating" />;
}

export function CompanionComposerAnchor() {
  const dock = useCompanionStore((state) => state.dock);
  if (dock !== 'composer') return null;
  return <div className="xv-companion-composer-anchor"><XrogaCompanion variant="composer" /><span className="xv-companion-composer-label">Smoky</span></div>;
}
