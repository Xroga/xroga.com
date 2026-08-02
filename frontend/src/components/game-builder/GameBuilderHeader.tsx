'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { HudIcon } from './HudIcons';

/**
 * The page header.
 *
 * Every destination is a route that already exists — no placeholder links. The
 * Resources menu is a real disclosure: a button with `aria-expanded`, Escape to
 * close, outside-click to close, and focus that stays in the document. A CSS
 * hover-only menu would be unreachable by keyboard, and this is the page's primary
 * navigation.
 */
const PRIMARY = [
  { href: '/features', label: 'Features' },
  { href: '/showcase', label: 'Showcase' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
] as const;

const RESOURCES = [
  { href: '/about', label: 'About Xroga' },
  { href: '/research', label: 'Research' },
  { href: '/community', label: 'Community' },
  { href: '/integrations', label: 'Integrations' },
] as const;

export function GameBuilderHeader() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onClick);
    };
  }, [open]);

  return (
    <header className="xv-gc-header">
      <div className="xv-gc-header__inner">
        <Logo href="/" height={30} />

        <nav className="xv-gc-nav" aria-label="Primary">
          {PRIMARY.map((item) => (
            <Link key={item.href} href={item.href} className="xv-gc-nav__link">
              {item.label}
            </Link>
          ))}

          <div className="xv-gc-nav__group" ref={wrapRef}>
            <button
              type="button"
              className="xv-gc-nav__link xv-gc-nav__trigger"
              aria-expanded={open}
              aria-haspopup="true"
              onClick={() => setOpen((o) => !o)}
            >
              Resources
              <HudIcon name="chevron" size={11} className="xv-gc-nav__chev" />
            </button>
            {open && (
              <div className="xv-gc-menu" role="menu" aria-label="Resources">
                {RESOURCES.map((item) => (
                  <Link key={item.href} href={item.href} className="xv-gc-menu__item" role="menuitem">
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="xv-gc-header__actions">
          <Link href="/auth/login" className="xv-gc-header__signin">
            Sign in
          </Link>
          <Link href="/auth/signup" className="xv-gc-btn xv-gc-btn--primary xv-gc-btn--sm">
            Build my game
          </Link>
        </div>
      </div>
    </header>
  );
}
