'use client';

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface HoverTipProps {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Use block + full width — required when wrapping sidebar nav links */
  block?: boolean;
}

interface TipPosition {
  top: number;
  left: number;
  /** Set once the tip has been measured; before that it is placed but not painted. */
  ready: boolean;
}

const GAP = 8;
/** Keeps a tip from touching the window edge when it has to be nudged back inside. */
const VIEWPORT_MARGIN = 8;

/**
 * A hover tip that cannot be clipped by its surroundings.
 *
 * It used to be an absolutely positioned span inside the trigger. That works until an
 * ancestor clips: `.xv-sidebar-floating` is `overflow: hidden`, so every sidebar tip
 * was cut off at the sidebar's right edge — the label and its description were sliced
 * mid-word, which is the one thing a tooltip must never do. No amount of z-index fixes
 * that; clipping happens before stacking is considered.
 *
 * So the tip renders in a portal on `document.body`, positioned from the trigger's own
 * rect. Nothing between it and the body can clip it, and because the coordinates are
 * `fixed` they stay correct inside scrolling containers too.
 */
export function HoverTip({
  label,
  description,
  children,
  className,
  side = 'right',
  block = false,
}: HoverTipProps) {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState(false);
  const [position, setPosition] = useState<TipPosition>({ top: 0, left: 0, ready: false });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>();
  const detailTimer = useRef<ReturnType<typeof setTimeout>>();

  function clearTimers() {
    clearTimeout(labelTimer.current);
    clearTimeout(detailTimer.current);
  }

  function onEnter() {
    labelTimer.current = setTimeout(() => setVisible(true), 280);
    if (description) {
      detailTimer.current = setTimeout(() => setDetail(true), 900);
    }
  }

  /**
   * Focus opens a tip for keyboard users, but a *click* also focuses — and a pointer
   * that clicks and then moves away never fires `mouseleave` on the trigger, so the
   * tip stayed on screen indefinitely. Two could be visible at once that way. Deferring
   * to `:focus-visible` is the browser's own answer to "was this focus from a keyboard",
   * so keyboard users keep the tip and clicking no longer strands one.
   */
  function onFocusIn(event: React.FocusEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    try {
      if (!target.matches(':focus-visible')) return;
    } catch {
      // Ancient engines without :focus-visible: showing the tip is the safe failure.
    }
    onEnter();
  }

  function onLeave() {
    clearTimers();
    setVisible(false);
    setDetail(false);
    setPosition((current) => ({ ...current, ready: false }));
  }

  /**
   * Place the tip beside the trigger, then pull it back inside the viewport if the
   * preferred side does not fit. Measuring the tip itself rather than assuming a size
   * is what makes the second step correct once the description expands it.
   */
  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!anchor || !tip) return;

    let top: number;
    let left: number;
    if (side === 'right') {
      top = anchor.top + anchor.height / 2 - tip.height / 2;
      left = anchor.right + GAP;
    } else if (side === 'left') {
      top = anchor.top + anchor.height / 2 - tip.height / 2;
      left = anchor.left - tip.width - GAP;
    } else if (side === 'top') {
      top = anchor.top - tip.height - GAP;
      left = anchor.left + anchor.width / 2 - tip.width / 2;
    } else {
      top = anchor.bottom + GAP;
      left = anchor.left + anchor.width / 2 - tip.width / 2;
    }

    // A tip that would open off-screen flips to the opposite side rather than being
    // squashed against the edge — the sidebar's own tips do this when it is collapsed
    // against the right of a narrow window.
    if (side === 'right' && left + tip.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = anchor.left - tip.width - GAP;
    } else if (side === 'left' && left < VIEWPORT_MARGIN) {
      left = anchor.right + GAP;
    }

    const maxLeft = window.innerWidth - tip.width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - tip.height - VIEWPORT_MARGIN;
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(left, Math.max(VIEWPORT_MARGIN, maxLeft))),
      top: Math.max(VIEWPORT_MARGIN, Math.min(top, Math.max(VIEWPORT_MARGIN, maxTop))),
      ready: true,
    });
  }, [side]);

  // Layout effect, not effect: the tip is painted at its final coordinates on the same
  // frame it appears, so it never flashes at the top-left corner first. `detail` is a
  // dependency because expanding the description changes the height it is centred on.
  useLayoutEffect(() => {
    if (!visible) return;
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [visible, detail, place]);

  return (
    <span
      ref={anchorRef}
      className={cn(
        'relative xv-hover-tip-wrap',
        block ? 'block w-full' : 'inline-flex',
        className
      )}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onFocusIn}
      onBlur={onLeave}
      // A tip has done its job the moment the user acts on the control.
      onPointerDown={onLeave}
    >
      {children}
      {visible && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                // Hidden rather than unmounted for the first frame: it has to be in the
                // document to be measured, and `visibility` keeps it out of sight while
                // still giving it a box.
                visibility: position.ready ? 'visible' : 'hidden',
              }}
              className={cn(
                'z-[300] pointer-events-none xv-hover-tip',
                detail && description ? 'xv-hover-tip-detail' : ''
              )}
            >
              <span className="block font-semibold text-[11px] whitespace-nowrap">{label}</span>
              {detail && description && (
                <span className="block text-[10px] opacity-85 mt-1 max-w-[200px] whitespace-normal leading-snug">
                  {description}
                </span>
              )}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
