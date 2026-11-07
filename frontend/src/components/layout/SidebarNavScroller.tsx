'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/** A compact progress control beside the native wheel/keyboard scroll surface. */
export function SidebarNavScroller({ targetRef, children, className }: { targetRef: RefObject<HTMLElement>; children: ReactNode; className?: string }) {
  return <div className={cn('xv-nav-scroller', className)}>
    {children}
    <CompactScrollIndicator targetRef={targetRef} controlsId="xv-sidebar-navigation" label="Sidebar" />
  </div>;
}

/** The short rail is intentionally independent of the content's scroll height. */
export function CompactScrollIndicator({ targetRef, controlsId, label, className }: { targetRef: RefObject<HTMLElement>; controlsId: string; label: string; className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ scrollable: false, progress: 0, thumbPercent: 100 });
  const update = useCallback(() => {
    const node = targetRef.current;
    if (!node) return;
    const range = Math.max(0, node.scrollHeight - node.clientHeight);
    setState({ scrollable: range > 3, progress: range ? node.scrollTop / range : 0, thumbPercent: Math.max(14, Math.min(100, node.clientHeight / node.scrollHeight * 100)) });
  }, [targetRef]);

  useEffect(() => {
    const node = targetRef.current;
    if (!node) return;
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    const mutation = new MutationObserver(update);
    mutation.observe(node, { childList: true, subtree: true, characterData: true });
    return () => { node.removeEventListener('scroll', update); observer.disconnect(); mutation.disconnect(); };
  }, [targetRef, update]);

  function seek(clientY: number) {
    const node = targetRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!node || !rect) return;
    const thumbHeight = rect.height * state.thumbPercent / 100;
    const fraction = Math.max(0, Math.min(1, (clientY - rect.top - thumbHeight / 2) / Math.max(1, rect.height - thumbHeight)));
    node.scrollTop = fraction * (node.scrollHeight - node.clientHeight);
  }

  return state.scrollable ? (
    <div className={cn('xv-nav-scroll-minimal', className)} aria-label={`${label} scrolling controls`}>
      <div
        ref={trackRef}
        className="xv-nav-scroll-minimal__track"
        role="scrollbar"
        aria-controls={controlsId}
        aria-label={`${label} position`}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(state.progress * 100)}
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowUp') { event.preventDefault(); targetRef.current?.scrollBy({ top: -80 }); }
          else if (event.key === 'ArrowDown') { event.preventDefault(); targetRef.current?.scrollBy({ top: 80 }); }
        }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); seek(event.clientY); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(event.clientY); }}
      >
        <span style={{ top: `${state.progress * (100 - state.thumbPercent)}%`, height: `${state.thumbPercent}%` }} />
      </div>
    </div>
  ) : null;
}
