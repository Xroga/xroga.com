'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Box = { left: number; top: number; bottom: number; height: number };
type Viewport = { left: number; top: number; width: number; height: number };

export function fitChatbarPopover(frame: Box, anchorLeft: number, width: number, height: number, viewport: Viewport, movable: boolean, minimumTop = viewport.top + 12) {
  const gap = 8, margin = 12;
  const bottom = viewport.top + viewport.height;
  const available = movable ? bottom - minimumTop - frame.height - gap - margin : bottom - frame.bottom - gap - margin;
  const maxHeight = Math.max(1, Math.min(height, viewport.height / 2, available));
  const offset = movable ? Math.max(0, frame.bottom + gap + maxHeight + margin - bottom) : 0;
  const panelWidth = Math.max(1, Math.min(width, viewport.width - margin * 2));
  return {
    left: Math.max(viewport.left + margin, Math.min(anchorLeft, viewport.left + viewport.width - panelWidth - margin)),
    top: frame.bottom - offset + gap, width: panelWidth, maxHeight, offset,
  };
}

/** Keep chatbar menus below their entire composer, including above a mobile keyboard. */
export function useChatbarPopoverLayout(open: boolean, anchorRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, width: number) {
  const [layout, setLayout] = useState({ left: 12, top: 12, width, maxHeight: 1, offset: 0 });
  const shifted = useRef<{ dock: HTMLElement; previous: string; offset: number } | null>(null);
  const reposition = useCallback(() => {
    const anchor = anchorRef.current, panel = panelRef.current;
    if (!anchor || !panel) return;
    const composer = anchor.closest<HTMLElement>('.xv-chatbar-solid');
    const frame = composer?.closest<HTMLElement>('.xv-kimi-composer-frame') ?? composer ?? anchor;
    const dock = composer?.closest<HTMLElement>('.xv-terminal-dock');
    const movable = Boolean(dock && !dock.classList.contains('xv-terminal-dock--idle'));
    if (shifted.current && (!movable || shifted.current.dock !== dock)) {
      const previous = shifted.current;
      if (previous.previous) previous.dock.style.setProperty('--xv-chatbar-popover-offset', previous.previous);
      else previous.dock.style.removeProperty('--xv-chatbar-popover-offset');
      shifted.current = null;
    }
    const visual = window.visualViewport;
    const viewport = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, width: visual?.width ?? innerWidth, height: visual?.height ?? innerHeight };
    const rect = frame.getBoundingClientRect();
    const applied = shifted.current && shifted.current.dock === dock ? shifted.current.offset : 0;
    const headerBottom = document.querySelector('[data-testid="terminal-identity-header"]')?.getBoundingClientRect().bottom ?? 0;
    const next = fitChatbarPopover({ left: rect.left, top: rect.top + applied, bottom: rect.bottom + applied, height: rect.height },
      anchor.getBoundingClientRect().left, width, panel.scrollHeight || 320, viewport, movable, Math.max(viewport.top + 12, headerBottom + 8));
    if (movable && dock) {
      if (!shifted.current) shifted.current = { dock, previous: dock.style.getPropertyValue('--xv-chatbar-popover-offset'), offset: 0 };
      shifted.current.offset = next.offset;
      dock.style.setProperty('--xv-chatbar-popover-offset', `${next.offset}px`);
    }
    setLayout(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  }, [anchorRef, panelRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    return () => {
      const previous = shifted.current;
      if (previous) {
        if (previous.previous) previous.dock.style.setProperty('--xv-chatbar-popover-offset', previous.previous);
        else previous.dock.style.removeProperty('--xv-chatbar-popover-offset');
        shifted.current = null;
      }
    };
  }, [open, reposition]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      observer?.disconnect();
    };
  }, [open, panelRef, reposition]);
  return layout;
}
