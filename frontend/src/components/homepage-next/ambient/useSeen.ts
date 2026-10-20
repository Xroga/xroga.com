'use client';

import { useEffect, useState, type RefObject } from 'react';

/** true once the element has been at least `threshold` in view; never goes back, so an entrance plays once */
export function useSeen(ref: RefObject<Element | null>, threshold = 0.5) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}
