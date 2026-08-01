'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * One DOM node, one requestAnimationFrame, and no React state on pointer move.
 * It is enabled only for precise mouse/trackpad input and respects reduced motion.
 */
export function LightMousePointer() {
  const pointerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const positionRef = useRef({ x: -40, y: -40 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const precisePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(precisePointer.matches && !reducedMotion.matches);
    update();
    precisePointer.addEventListener('change', update);
    reducedMotion.addEventListener('change', update);
    return () => {
      precisePointer.removeEventListener('change', update);
      reducedMotion.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.xrogaPointer = 'true';

    const paint = () => {
      frameRef.current = null;
      const node = pointerRef.current;
      if (node) {
        node.style.transform = `translate3d(${positionRef.current.x - 7}px, ${positionRef.current.y - 7}px, 0)`;
        node.dataset.visible = 'true';
      }
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      positionRef.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current == null) frameRef.current = window.requestAnimationFrame(paint);
    };
    const onDown = () => {
      const node = pointerRef.current;
      if (!node) return;
      node.dataset.clicking = 'false';
      void node.offsetWidth;
      node.dataset.clicking = 'true';
    };
    const onLeave = () => {
      if (pointerRef.current) pointerRef.current.dataset.visible = 'false';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      delete root.dataset.xrogaPointer;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={pointerRef} className="xv-light-pointer" data-visible="false" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <g className="xv-light-pointer__rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M9 4V2" />
          <path d="M5 5L3.5 3.5" />
          <path d="M4 9H2" />
          <path d="M5 13L3.5 14.5" />
          <path d="M14.5 3.5L13 5" />
        </g>
        <path
          className="xv-light-pointer__body"
          d="M12.669 8.358 17.697 10.326c2.9 1.134 4.35 1.702 4.302 2.602-.048.9-1.562 1.313-4.588 2.138-.901.246-1.352.369-1.664.681-.312.312-.435.763-.681 1.664-.826 3.027-1.238 4.54-2.138 4.588-.9.048-1.468-1.402-2.602-4.302l-1.968-5.028c-1.188-3.036-1.782-4.554-1.013-5.324.77-.769 2.288-.175 5.324 1.013Z"
          fill="var(--card)"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
