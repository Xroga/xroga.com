'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedIcon, type AnimatedIconComponent } from '@/components/icons/animated/AnimatedIcon';
import { TerminalIcon } from '@/components/icons/animated/TerminalIcon';
import { LayoutGridIcon } from '@/components/icons/animated/LayoutGridIcon';
import { FolderOpenIcon } from '@/components/icons/animated/FolderOpenIcon';
import { ConnectIcon } from '@/components/icons/animated/ConnectIcon';
import { RocketIcon } from '@/components/icons/animated/RocketIcon';
import { HeartPulseIcon } from '@/components/icons/animated/HeartPulseIcon';
import { ChartColumnIncreasingIcon } from '@/components/icons/animated/ChartColumnIncreasingIcon';
import { CogIcon } from '@/components/icons/animated/CogIcon';

/**
 * The same icons the sidebar uses, so a destination looks like itself whichever
 * chrome you reach it through. Plan is gone: it lives on the Dashboard next to the
 * billing it belongs with, and eight tabs already scroll on a phone.
 */
const items: { href: string; label: string; icon: AnimatedIconComponent }[] = [
  { href: '/workspace', label: 'Workspace', icon: TerminalIcon },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGridIcon },
  { href: '/dashboard/projects', label: 'Repositories', icon: FolderOpenIcon },
  { href: '/dashboard/integrations', label: 'Integrations', icon: ConnectIcon },
  { href: '/dashboard/publish', label: 'Publish', icon: RocketIcon },
  { href: '/dashboard/operations', label: 'Operations', icon: HeartPulseIcon },
  { href: '/dashboard/growth', label: 'Growth', icon: ChartColumnIncreasingIcon },
  { href: '/settings', label: 'Settings', icon: CogIcon },
];

/** How far a vertical drag must travel before it counts as hide or show. */
const SWIPE_THRESHOLD_PX = 28;

export function MobileNav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const dragStart = useRef<number | null>(null);

  /*
   * Swipe down on the bar to put it away, swipe up on the handle to bring it back.
   *
   * The handle stays on screen while the bar is down — a gesture with nothing left
   * to grab is a gesture nobody can undo. Touch events rather than pointer events:
   * this is a touch-only affordance, and binding pointer events would arm it for a
   * mouse drag on a tablet-width desktop window too.
   */
  const onTouchStart = useCallback((event: React.TouchEvent) => {
    dragStart.current = event.touches[0]?.clientY ?? null;
  }, []);

  const onTouchEnd = useCallback((event: React.TouchEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientY;
    if (end === undefined) return;
    const travel = end - start;
    if (travel > SWIPE_THRESHOLD_PX) setHidden(true);
    else if (travel < -SWIPE_THRESHOLD_PX) setHidden(false);
  }, []);

  // A tab reached from somewhere else — a sidebar link, a redirect — can be off the
  // end of the row, so it is brought into view rather than left for the reader to
  // hunt for.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [pathname]);

  if (pathname === '/workspace' || pathname === '/workspace/') return null;

  return (
    <nav
      aria-label="Primary"
      data-hidden={hidden ? 'true' : 'false'}
      className="xv-mobile-nav lg:hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="xv-mobile-nav__bar">
        {items.map(({ href, label, icon }) => {
          const path = href.split('?')[0];
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
          return (
            <Link
              key={href}
              href={href}
              ref={active ? activeRef : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn('xv-mobile-nav__tab', active && 'is-active')}
            >
              {/* The selected tab's glyph sits in a filled disc in the accent the
                  reader chose, so the active state is a shape and not only a colour. */}
              <span className="xv-mobile-nav__disc">
                <AnimatedIcon icon={icon} size={18} intro={false} />
              </span>
              <span className="xv-mobile-nav__label">{label}</span>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        className="xv-mobile-nav__handle"
        onClick={() => setHidden((value) => !value)}
        aria-expanded={!hidden}
        aria-label={hidden ? 'Show navigation' : 'Hide navigation'}
      >
        {/* Also a button, not only a swipe target: a gesture with no visible control
            behind it is undiscoverable, and unusable with a keyboard. */}
        <span aria-hidden="true" />
      </button>
    </nav>
  );
}
