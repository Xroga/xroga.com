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
 * billing it belongs with. Eight compact glyphs fit in the same rounded dock as
 * the top mobile header, so navigation needs neither visible labels nor a scroller.
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

/**
 * How far the page must scroll before the bar reacts.
 *
 * Without a floor, the rubber-banding at the top and bottom of a phone scroll flickers
 * the bar on and off while the reader is holding still.
 */
const SCROLL_THRESHOLD_PX = 12;

export function MobileNav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
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
    // Up puts it away, down brings it back — the same direction as the page scroll
    // that does it, so the gesture and the scroll cannot disagree.
    if (travel < -SWIPE_THRESHOLD_PX) setHidden(true);
    else if (travel > SWIPE_THRESHOLD_PX) setHidden(false);
  }, []);

  /*
   * Reading down the page puts the bar away; coming back up brings it out.
   *
   * This replaces the grab handle. The handle was a 4px line under the bar whose only
   * job was to undo a gesture — a control that exists to fix another control. Tying
   * the bar to the scroll it is competing with means it is out of the way exactly when
   * the reader is reading, and back the moment they look for it, with nothing to learn.
   *
   * The top of the page always shows it: a reader who has scrolled back to the start
   * is not reading past it, and a bar that stayed hidden there would look broken.
   */
  useEffect(() => {
    let previous = window.scrollY;
    const onScroll = () => {
      const current = window.scrollY;
      const travel = current - previous;
      if (Math.abs(travel) < SCROLL_THRESHOLD_PX) return;
      previous = current;
      if (current <= 0) setHidden(false);
      else setHidden(travel > 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A destination reached from somewhere else brings the bar back with it — arriving
  // on a new page with no navigation on screen is the one state it must never be in.
  useEffect(() => setHidden(false), [pathname]);

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
              aria-current={active ? 'page' : undefined}
              className={cn('xv-mobile-nav__tab', active && 'is-active')}
            >
              {/* The phone dock is visual shorthand: the animated glyph carries the
                  destination while the label stays in the accessibility tree. */}
              <span className="xv-mobile-nav__disc">
                <AnimatedIcon icon={icon} size={18} intro={false} />
              </span>
              <span className="xv-mobile-nav__label">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
