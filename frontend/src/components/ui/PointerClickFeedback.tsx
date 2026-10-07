'use client';

import { useEffect, useRef } from 'react';

/** A brief click acknowledgement that leaves the operating-system cursor intact. */
export function PointerClickFeedback() {
  const feedbackRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const feedback = feedbackRef.current;
    if (!feedback) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;

      feedback.getAnimations().forEach((animation) => animation.cancel());
      feedback.style.left = `${event.clientX}px`;
      feedback.style.top = `${event.clientY}px`;
      feedback.animate(
        [
          { opacity: 0.72, transform: 'translate(-50%, -50%) scale(.35)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)' },
        ],
        { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return <span ref={feedbackRef} className="xv-pointer-click-feedback" aria-hidden="true" />;
}
