'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

type Box = { left: number; top: number; bottom: number; height: number };
type Viewport = { left: number; top: number; width: number; height: number };

export function fitChatbarPopover(frame: Box, anchorLeft: number, width: number, height: number, viewport: Viewport, movable: boolean, minimumTop = viewport.top + 12) {
  const gap = 8, margin = 12;
  const bottom = viewport.top + viewport.height;
  const available = movable ? bottom - minimumTop - frame.height - gap - margin : bottom - frame.bottom - gap - margin;
  const maxHeight = Math.max(1, Math.min(height, viewport.height / 2, available, 360));
  const offset = movable ? Math.max(0, frame.bottom + gap + maxHeight + margin - bottom) : 0;
  const panelWidth = Math.max(1, Math.min(width, viewport.width - margin * 2));
  return {
    left: Math.max(viewport.left + margin, Math.min(anchorLeft, viewport.left + viewport.width - panelWidth - margin)),
    top: frame.bottom - offset + gap, width: panelWidth, maxHeight, offset,
  };
}

/** A composer docked at the bottom of the screen opens its menu above itself, never off-screen below. */
export function fitChatbarPopoverAbove(frame: Box, anchorLeft: number, width: number, height: number, viewport: Viewport, minimumTop = viewport.top + 12) {
  const gap = 8, margin = 12;
  const available = frame.top - minimumTop - gap;
  const maxHeight = Math.max(1, Math.min(height, available, viewport.height / 2, 360));
  const panelWidth = Math.max(1, Math.min(width, viewport.width - margin * 2));
  return {
    left: Math.max(viewport.left + margin, Math.min(anchorLeft, viewport.left + viewport.width - panelWidth - margin)),
    top: Math.max(minimumTop, frame.top - gap - maxHeight), width: panelWidth, maxHeight, offset: 0,
  };
}

/** Chatbar menus open below the centered start composer and above a bottom-docked one. */
export function useChatbarPopoverLayout(open: boolean, anchorRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, width: number) {
  const [layout, setLayout] = useState({ left: 12, top: 12, width, maxHeight: 1, offset: 0 });
  const reposition = useCallback(() => {
    const anchor = anchorRef.current, panel = panelRef.current;
    if (!anchor || !panel) return;
    const composer = anchor.closest<HTMLElement>('.xv-chatbar-solid');
    const frame = composer?.closest<HTMLElement>('.xv-kimi-composer-frame') ?? composer ?? anchor;
    const dock = composer?.closest<HTMLElement>('.xv-terminal-dock');
    const movable = Boolean(dock && !dock.classList.contains('xv-terminal-dock--idle'));
    const visual = window.visualViewport;
    const viewport = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, width: visual?.width ?? innerWidth, height: visual?.height ?? innerHeight };
    const rect = frame.getBoundingClientRect();
    const headerBottom = document.querySelector('[data-testid="terminal-identity-header"]')?.getBoundingClientRect().bottom ?? 0;
    const minimumTop = Math.max(viewport.top + 12, headerBottom + 8);
    const panelHeight = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
    const next = movable
      ? fitChatbarPopoverAbove({ left: rect.left, top: rect.top, bottom: rect.bottom, height: rect.height },
        anchor.getBoundingClientRect().left, width, panelHeight || 320, viewport, minimumTop)
      : fitChatbarPopover({ left: rect.left, top: rect.top, bottom: rect.bottom, height: rect.height },
        anchor.getBoundingClientRect().left, width, panelHeight || 320, viewport, false, minimumTop);
    setLayout(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  }, [anchorRef, panelRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
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
