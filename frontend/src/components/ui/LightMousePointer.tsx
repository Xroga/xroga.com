'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Global branded pointer with a zero-frame-lag update path.
 *
 * Pointer movement writes only a GPU-friendly transform to one isolated DOM node.
 * No React state, requestAnimationFrame queue, forced layout, or geometry lookup
 * runs for every mouse sample.
 */
export function LightMousePointer() {
  const pointerRef = useRef<HTMLDivElement>(null);
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
    const node = pointerRef.current;
    if (!node) return;

    root.dataset.xrogaPointer = 'true';

    const body = node.querySelector<SVGPathElement>('.xv-light-pointer__body');
    const rays = node.querySelector<SVGGElement>('.xv-light-pointer__rays');
    let lastTarget: EventTarget | null = null;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;

      // Direct compositor transform: do not wait for the next animation frame.
      node.style.transform =
        `translate3d(${event.clientX - 7}px, ${event.clientY - 7}px, 0)`;
      node.dataset.visible = 'true';

      // DOM ancestry checks only when the pointer actually enters a new target.
      if (event.target !== lastTarget) {
        lastTarget = event.target;
        const target = event.target as Element | null;
        node.dataset.mode = target?.closest?.('.xv-sidebar-resize-handle')
          ? 'resize'
          : 'pointer';
      }
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;

      body?.animate(
        [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(1px) scale(.94)', offset: 0.5 },
          { transform: 'translateY(0) scale(1)' },
        ],
        { duration: 180, easing: 'ease-out' },
      );

      rays?.animate(
        [
          { opacity: 0.28, transform: 'scale(.78)' },
          { opacity: 0.9, transform: 'scale(1.12)', offset: 0.45 },
          { opacity: 0.28, transform: 'scale(1)' },
        ],
        { duration: 220, easing: 'ease-out' },
      );
    };

    const onLeave = () => {
      node.dataset.visible = 'false';
      lastTarget = null;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);

    return () => {
      delete root.dataset.xrogaPointer;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={pointerRef}
      className="xv-light-pointer"
      data-visible="false"
      data-mode="pointer"
      aria-hidden="true"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <g className="xv-light-pointer__default">
          <g
            className="xv-light-pointer__rays"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
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
        </g>
        <g
          className="xv-light-pointer__resize"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="6" width="18" height="12" rx="6" fill="var(--card)" />
          <path d="m8 9-3 3 3 3M16 9l3 3-3 3M6 12h12" />
        </g>
      </svg>
    </div>
  );
}
