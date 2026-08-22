'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, SquareTerminal, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

/**
 * Header for /ai-coding-agent. Client-side only for the mobile drawer.
 *
 * The reference nav reads Docs · Community · Crypto Builder · Pricing · Changelog. Three
 * of those resolve and two do not: there has never been a `/changelog` route, and
 * `/crypto-builder` is a URL several older components link to but which no page has ever
 * served — the real page is `/crypto`. The shape of the nav is kept; the destinations are
 * routes that exist, because a header full of 404s is worse than one that reads slightly
 * differently from a mockup.
 */
const NAV = [
  { href: '/docs', label: 'Docs' },
  { href: '/community', label: 'Community' },
  { href: '/crypto', label: 'Crypto Builder' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/features', label: 'Features' },
] as const;

export function AiCodingAgentHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="agx-header">
      <div className="agx-shell agx-header__inner">
        <Logo href="/" variant="homepage" height={34} className="agx-header__brand" />

        <nav className="agx-nav" aria-label="AI coding agent">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="agx-navlink">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="agx-header__actions">
          {/* Goes to the workspace, which is what a terminal glyph should open. */}
          <Link href="/dashboard" className="agx-iconbtn" aria-label="Open the workspace">
            <SquareTerminal aria-hidden="true" />
          </Link>
          <Link href="/auth/login" className="agx-signin">Sign in</Link>
          <Link href="/auth/signup" className="agx-btn agx-btn--sm">
            Start building <ArrowRight aria-hidden="true" />
          </Link>
        </div>

        <button
          type="button"
          className="agx-menu"
          aria-expanded={open}
          aria-controls="agx-mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      <div className="agx-drawer" id="agx-mobile-nav" data-open={open}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </Link>
        ))}
        <div className="agx-drawer__actions">
          <Link href="/auth/login" className="agx-btn agx-btn--ghost" onClick={() => setOpen(false)}>Sign in</Link>
          <Link href="/auth/signup" className="agx-btn" onClick={() => setOpen(false)}>Start building</Link>
        </div>
      </div>
    </header>
  );
}
