'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface SidebarHoverMenuProps {
  trigger: ReactElement;
  children: ReactNode;
  className?: string;
}

const VIEWPORT_PAD = 12;
const POINTER_BRIDGE_MS = 180;

/** A portalled sidebar flyout that remains open while the pointer crosses to it. */
export function SidebarHoverMenu({ trigger, children, className }: SidebarHoverMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), POINTER_BRIDGE_MS);
  }

  useEffect(() => () => cancelClose(), []);

  useLayoutEffect(() => {
    if (!open) return;

    function placeMenu() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const gap = 8;
      const menuWidth = menu.offsetWidth || 220;
      const menuHeight = menu.offsetHeight || 180;
      let left = anchor.right + gap;
      if (left + menuWidth > window.innerWidth - VIEWPORT_PAD) {
        left = anchor.left - menuWidth - gap;
      }
      const top = Math.max(
        VIEWPORT_PAD,
        Math.min(anchor.top, window.innerHeight - menuHeight - VIEWPORT_PAD),
      );
      setPos({ top, left: Math.max(VIEWPORT_PAD, left) });
    }

    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        anchorRef.current?.querySelector<HTMLElement>('button')?.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  function focusMenu() {
    setOpen(true);
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus());
  }

  const triggerWithState = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        // Focus fires before click. Both paths must converge on open; toggling here
        // opened on focus and immediately closed again for mouse and touch users.
        onClick: () => setOpen(true),
        onFocus: () => setOpen(true),
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            focusMenu();
          }
        },
      })
    : trigger;

  return (
    <>
      <span
        ref={anchorRef}
        className="block w-full"
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
      >
        {triggerWithState}
      </span>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className={cn('xv-sidebar-hover-menu fixed z-[320]', className)}
              style={{ top: pos.top, left: pos.left }}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a,button')) setOpen(false);
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
