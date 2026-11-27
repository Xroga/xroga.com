'use client';

import { useEffect, useRef } from 'react';
import type { TimelineFamily } from '@/lib/terminal/activityTimeline';
import styles from './black-hole.module.css';

/**
 * Decorative: dots orbiting a black hole beside the working line. Their motion follows the kind of work the
 * backend reported, never the wording of the prompt. The adjacent text provides the accessible status.
 */
export function BlackHoleIndicator({ compact = false, family = 'other' }: { compact?: boolean; family?: TimelineFamily }) {
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
    <span ref={ref} className={styles.mark} data-black-hole="" data-family={family} data-compact={compact || undefined} aria-hidden="true">
      <svg viewBox="0 0 28 28" fill="none" focusable="false">
        <ellipse className={styles.path} cx="14" cy="14" rx="11.5" ry="5.2" transform="rotate(-24 14 14)" />
        <circle className={styles.horizon} cx="14" cy="14" r="4.6" />
        <circle className={styles.rim} cx="14" cy="14" r="4.6" />
        <g transform="translate(14 14) rotate(-24)">
          <circle className={`${styles.dot} ${styles.first}`} r="3" />
          <circle className={`${styles.dot} ${styles.second}`} r="2.5" />
          <circle className={`${styles.dot} ${styles.third}`} r="2" />
        </g>
      </svg>
    </span>
  );
}
