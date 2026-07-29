'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { XrogaCompanion } from './XrogaCompanion';
import { useCompanionStore } from '@/store/useCompanionStore';

interface Position { left: number; top: number }

export function HomepageCompanionStage() {
  const [position, setPosition] = useState<Position | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('xroga-smoky-position');
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as Position;
      if (Number.isFinite(value.left) && Number.isFinite(value.top)) setPosition(value);
    } catch { localStorage.removeItem('xroga-smoky-position'); }
  }, []);

  function start(event: React.PointerEvent<HTMLDivElement>) {
    if (!(event.target as Element).closest('.xv-companion-trigger')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.current.moved = true;
    const left = Math.max(8, Math.min(window.innerWidth - 112, drag.current.left + dx));
    const top = Math.max(72, Math.min(window.innerHeight - 130, drag.current.top + dy));
    setPosition({ left, top });
  }

  function end() {
    if (position) localStorage.setItem('xroga-smoky-position', JSON.stringify(position));
    window.setTimeout(() => { drag.current = null; }, 0);
  }

  return <div className="xv-home-companion-stage" style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined} onPointerDown={start} onPointerMove={move} onPointerUp={end} onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }}><XrogaCompanion variant="hero" /></div>;
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
