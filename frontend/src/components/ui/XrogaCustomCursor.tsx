'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

type CursorMode = 'arrow' | 'pointer';

interface Spark {
  id: number;
  x: number;
  y: number;
}

const INTERACTIVE =
  'a,button,input,textarea,select,label,[role="button"],[role="link"],.cursor-pointer,[data-cursor="pointer"]';

function PixelArrow({ className }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* 3D extrusion — pink left */}
      <path d="M4 4 L4 20 L10 14 L14 22 L18 20 L12 12 L20 12 Z" fill="#ec4899" opacity="0.85" />
      {/* extrusion — purple/blue right */}
      <path d="M6 6 L6 18 L11 13 L15 20 L16 19 L11 11 L18 11 Z" fill="#8b5cf6" opacity="0.7" />
      {/* main pixel arrow */}
      <path
        d="M5 5 L5 17 L10 12 L14 19 L16 18 L11 10 L17 10 Z"
        fill="#0f0f14"
        stroke="#fff"
        strokeWidth="0.8"
      />
      <path d="M5 5 L5 17 L10 12 L14 19 L16 18 L11 10 L17 10 Z" fill="url(#xv-cursor-grad)" opacity="0.15" />
      <defs>
        <linearGradient id="xv-cursor-grad" x1="5" y1="5" x2="17" y2="19">
          <stop stopColor="#60a5fa" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PixelHand({ className }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M10 8 V14 M13 6 V16 M16 7 V17 M19 10 V18 M12 18 C12 20 14 22 16 22 H18 C21 22 23 19 23 16 V12 C23 10 21 9 19 10"
        stroke="#ec4899"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M9 9 V13 M12 7 V15 M15 8 V16 M18 11 V17 M11 17 C11 19 13 21 15 21 H17 C20 21 22 18 22 15 V11 C22 9 20 8 18 11"
        stroke="#0f0f14"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="7" y="13" width="5" height="8" rx="1" fill="#0f0f14" stroke="#fff" strokeWidth="0.6" />
    </svg>
  );
}

export function XrogaCustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<CursorMode>('arrow');
  const [hovering, setHovering] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const sparkId = useRef(0);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
    const apply = () => {
      const on = mq.matches;
      setEnabled(on);
      document.body.classList.toggle('xv-custom-cursor-active', on);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      document.body.classList.remove('xv-custom-cursor-active');
    };
  }, []);

  const spawnSpark = useCallback((x: number, y: number) => {
    const id = ++sparkId.current;
    setSparks((s) => [...s.slice(-8), { id, x, y }]);
    setTimeout(() => setSparks((s) => s.filter((p) => p.id !== id)), 600);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.35;
      pos.current.y += (target.current.y - pos.current.y) * 0.35;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const interactive = el?.closest(INTERACTIVE);
      setMode(interactive ? 'pointer' : 'arrow');
      setHovering(!!interactive);
    };

    const onDown = (e: MouseEvent) => {
      setClicking(true);
      spawnSpark(e.clientX, e.clientY);
    };
    const onUp = () => setClicking(false);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, [enabled, spawnSpark]);

  if (!enabled) return null;

  return (
    <>
      <div ref={ringRef} className={cn('xv-cursor-ring', hovering && 'xv-cursor-ring--hover', clicking && 'xv-cursor-ring--click')} aria-hidden />
      <div
        ref={cursorRef}
        className={cn(
          'xv-cursor-pixel',
          hovering && 'xv-cursor-pixel--hover',
          clicking && 'xv-cursor-pixel--click',
          mode === 'pointer' && 'xv-cursor-pixel--pointer'
        )}
        aria-hidden
      >
        {mode === 'pointer' ? <PixelHand /> : <PixelArrow />}
        {hovering && <span className="xv-cursor-sparkle" />}
      </div>
      {sparks.map((s) => (
        <span
          key={s.id}
          className="xv-cursor-burst"
          style={{ left: s.x, top: s.y }}
          aria-hidden
        />
      ))}
    </>
  );
}
