'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Reveals its children once they enter the viewport.
 *
 * Built on IntersectionObserver and a CSS class rather than a motion library — this
 * page is marketing chrome, not application UI, and pulling in a JS animation
 * runtime for a fade-and-rise is the kind of cost this site has been actively
 * cutting (font preloads, skeleton CSS, dead dependencies). The observer disconnects
 * itself after the first reveal, so it costs nothing once the page has settled.
 *
 * `prefers-reduced-motion` is handled by CSS alone (`@media` in the stylesheet), not
 * by branching here — the element still needs `is-visible` for its resting opacity
 * and position to apply, reduced motion or not.
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds, staggers a group of siblings without extra markup. */
  delay?: number;
  as?: 'div' | 'li' | 'article';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Comp = Tag as 'div';
  return (
    <Comp
      ref={ref}
      className={cn('xv-cap-reveal', visible && 'is-visible', className)}
      style={delay ? ({ transitionDelay: `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Comp>
  );
}
