'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  const [state, setState] = useState({ scrollable: false, progress: 0, atTop: true, atBottom: true });
  const update = useCallback(() => {
    const node = targetRef.current;
    if (!node) return;
    const range = Math.max(0, node.scrollHeight - node.clientHeight);
    setState({ scrollable: range > 3, progress: range ? node.scrollTop / range : 0, atTop: node.scrollTop < 2, atBottom: node.scrollTop >= range - 2 });
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
    const fraction = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    node.scrollTop = fraction * (node.scrollHeight - node.clientHeight);
  }

  return state.scrollable ? <div className={cn('xv-nav-scroll-controls', className)} aria-label={`${label} scrolling controls`}>
      <button type="button" aria-label={`Scroll ${label.toLowerCase()} up`} disabled={state.atTop} onClick={() => targetRef.current?.scrollBy({ top: -220, behavior: 'smooth' })}><ChevronUp size={12} /></button>
      <div ref={trackRef} className="xv-nav-scroll-progress" role="scrollbar" aria-controls={controlsId} aria-label={`${label} position`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)} tabIndex={0}
        onKeyDown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); targetRef.current?.scrollBy({ top: -80 }); } else if (event.key === 'ArrowDown') { event.preventDefault(); targetRef.current?.scrollBy({ top: 80 }); } }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); seek(event.clientY); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(event.clientY); }}>
        <span style={{ top: `calc(${state.progress * 100}% - ${state.progress * 12}px)` }} />
      </div>
      <button type="button" aria-label={`Scroll ${label.toLowerCase()} down`} disabled={state.atBottom} onClick={() => targetRef.current?.scrollBy({ top: 220, behavior: 'smooth' })}><ChevronDown size={12} /></button>
    </div> : null;
}
