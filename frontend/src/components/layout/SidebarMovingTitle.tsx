'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';

/** Measure real overflow so the final character is fully visible at the pause. */
export const SidebarMovingTitle = memo(function SidebarMovingTitle({ text }: { text: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const measure = () => setDistance(Math.max(0, (content.current?.scrollWidth ?? 0) - (viewport.current?.clientWidth ?? 0)));
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [text]);
  return <span ref={viewport} className="xv-sidebar-long-title" aria-label={text} title={text}
    style={{ '--xv-title-travel': `${distance}px` } as CSSProperties}>
    <span className="xv-sidebar-long-title__rest" aria-hidden="true">{text}</span>
    <span ref={content} className={distance > 0 ? 'xv-sidebar-long-title__content is-overflowing' : 'xv-sidebar-long-title__content'}>{text}</span>
  </span>;
});
