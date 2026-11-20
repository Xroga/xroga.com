'use client';

import { useEffect, useState } from 'react';
import styles from '@/components/dashboard/WorkspaceScrollPolish.module.css';

type ScrollPosition = { scrollable: boolean; atTop: boolean; atBottom: boolean };
const INITIAL: ScrollPosition = { scrollable: false, atTop: true, atBottom: true };

// Uiverse.io R5Program arrow supplied for Xroga, rotated for down navigation.
function NavigationArrow({ down = false }: { down?: boolean }) {
  return (
    <svg className={down ? styles.downArrow : styles.arrow} xmlns="http://www.w3.org/2000/svg"
      height="25px" viewBox="0 -960 960 960" width="25px" fill="currentColor" aria-hidden="true">
      <path d="M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z" />
    </svg>
  );
}

export function WorkspaceScrollNavigation({
  scrollToFirst, scrollToLatest,
}: {
  scrollToFirst: (behavior?: ScrollBehavior) => void;
  scrollToLatest: (behavior?: ScrollBehavior) => void;
}) {
  const [position, setPosition] = useState<ScrollPosition>(INITIAL);

  useEffect(() => {
    // Never use the window scroll offset for the workspace transcript.
    const scroller = document.querySelector<HTMLElement>('.xv-terminal-scroll');
    if (!scroller) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next: ScrollPosition = {
        scrollable: maxScroll > 8,
        atTop: scroller.scrollTop <= 48, // first response sits below a small inset
        atBottom: maxScroll - scroller.scrollTop <= 6,
      };
      setPosition(current => current.scrollable === next.scrollable &&
        current.atTop === next.atTop && current.atBottom === next.atBottom ? current : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(sync); };
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    // Streaming changes content height without changing the pane's own height.
    const content = scroller.querySelector<HTMLElement>('.xv-terminal-window');
    if (content) resize.observe(content);
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resize.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const navigate = (direction: 'top' | 'bottom') => {
    const scroller = document.querySelector<HTMLElement>('.xv-terminal-scroll');
    const destination = direction === 'bottom'
      ? Math.max(0, (scroller?.scrollHeight ?? 0) - (scroller?.clientHeight ?? 0)) : 0;
    const distance = Math.abs((scroller?.scrollTop ?? 0) - destination);
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      Boolean(scroller && distance > scroller.clientHeight * 3) ? 'auto' : 'smooth';
    if (direction === 'bottom') scrollToLatest(behavior);
    else scrollToFirst(behavior);
  };

  const visible = position.scrollable && !position.atBottom;
  return (
    <div className={styles.navigation} data-visible={visible ? 'true' : 'false'}
      aria-hidden={!visible} data-testid="workspace-scroll-navigation">
      {!position.atTop ? (
        <button type="button" className={styles.navButton} aria-label="Scroll to first response"
          data-label="Top" tabIndex={visible ? 0 : -1} onClick={() => navigate('top')}>
          <NavigationArrow />
        </button>
      ) : null}
      <button type="button" className={styles.navButton} aria-label="Scroll to last response"
        data-label="Bottom" tabIndex={visible ? 0 : -1} onClick={() => navigate('bottom')}>
        <NavigationArrow down />
      </button>
    </div>
  );
}
