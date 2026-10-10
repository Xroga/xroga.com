'use client';
import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';
/** One native, draggable scroll surface for navigation, repositories, pinned and recents. */
export function SidebarNavScroller({ targetRef, children, className }: { targetRef: RefObject<HTMLElement>; children: ReactNode; className?: string }) {
  void targetRef; // The existing caller owns the scrollable nav element.
  return <div className={cn('xv-nav-scroller', className)}>{children}</div>;
}
