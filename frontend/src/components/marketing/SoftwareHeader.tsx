'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

/**
 * Header for /software. Client-side only for the mobile drawer.
 *
 * Every destination is a route that exists in `src/app`. Nothing here points at
 * `/crypto-builder`, which several older components link to but which has never been
 * a route — the real page is `/crypto`.
 */
const NAV = [
  { href: '/features', label: 'Product' },
  { href: '/showcase', label: 'Showcase' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
] as const;

export function SoftwareHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="xsw-header">
      <div className="xsw-shell">
        <div className="xsw-header__inner">
          {/* The real Logo component — never a generated or redrawn mark. */}
          <Logo href="/" variant="homepage" height={38} className="xsw-header__brand" />

          <nav className="xsw-header__nav" aria-label="Software">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="xsw-navlink">{item.label}</Link>
            ))}
          </nav>

          <div className="xsw-header__actions">
            <Link href="/auth/login" className="xsw-signin">Sign in</Link>
            <Link href="/auth/signup" className="xsw-btn">Get started</Link>
          </div>

          <button
            type="button"
            className="xsw-menu"
            aria-expanded={open}
            aria-controls="xsw-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>

        <div className="xsw-drawer" id="xsw-mobile-nav" data-open={open}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
          <div className="xsw-drawer__actions">
            <Link href="/auth/login" className="xsw-btn xsw-btn--ghost" onClick={() => setOpen(false)}>Sign in</Link>
            <Link href="/auth/signup" className="xsw-btn" onClick={() => setOpen(false)}>Get started</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
