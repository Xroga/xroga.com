'use client';

import { useEffect, useRef } from 'react';
import styles from './black-hole.module.css';

/** Decorative. Mount only in the working header. The adjacent status provides the accessible text. */
export function BlackHoleIndicator({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = typeof IntersectionObserver === 'undefined';
    const update = () => {
      element.dataset.motion = visible && !document.hidden ? 'running' : 'paused';
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer?.observe(element);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <span ref={ref} className={styles.mark} data-black-hole="" data-compact={compact || undefined} aria-hidden="true">
      <svg viewBox="0 0 28 28" fill="none" focusable="false">
        <ellipse className={styles.primary} cx="14" cy="14" rx="12.4" ry="4.8" transform="rotate(14 14 14)" />
        <ellipse className={styles.secondary} cx="14" cy="14" rx="12.4" ry="4.6" transform="rotate(-61 14 14)" />
        <circle className={styles.horizon} cx="14" cy="14" r="4.3" />
        <circle className={styles.rim} cx="14" cy="14" r="4.3" />
        <ellipse className={styles.cyan} cx="14" cy="14" rx="12.4" ry="4.8" transform="rotate(14 14 14)" pathLength="100" />
        <ellipse className={styles.violet} cx="14" cy="14" rx="12.4" ry="4.6" transform="rotate(-61 14 14)" pathLength="100" />
        <g className={styles.particles}>
          <circle cx="5.2" cy="6.2" r=".65" />
          <circle cx="23" cy="5.7" r=".55" />
          <circle cx="22.2" cy="23.7" r=".65" />
        </g>
      </svg>
    </span>
  );
}
