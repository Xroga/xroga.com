'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

/**
 * The landing header.
 *
 * Client-side only because of the mobile drawer toggle — everything else on this page
 * stays server-rendered. Every destination below is a route that exists in
 * `src/app`; none is invented, and none points at `/crypto-builder`, which the shared
 * marketing footer links to but which has never been a route (the real one is
 * `/crypto`).
 */
const NAV = [
  { href: '/features', label: 'Product' },
  { href: '/showcase', label: 'Templates' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/research', label: 'Research' },
] as const;

export function AiAppBuilderHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="xab-header">
      <div className="xab-shell">
        <div className="xab-header__inner">
          {/* The real logo component, homepage variant — not a redrawn mark. */}
          <Logo href="/" variant="homepage" height={40} className="xab-header__brand" />

          <nav className="xab-header__nav" aria-label="AI App Builder">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="xab-header__link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="xab-header__actions">
            <Link href="/auth/login" className="xab-signin">Sign in</Link>
            <Link href="/auth/signup" className="xab-cta">Get started free</Link>
          </div>

          <button
            type="button"
            className="xab-menu-button"
            aria-expanded={open}
            aria-controls="xab-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>

        <div className="xab-drawer" id="xab-mobile-nav" data-open={open}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="xab-drawer__link"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="xab-drawer__actions">
            <Link href="/auth/login" className="xab-cta xab-cta--ghost" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="/auth/signup" className="xab-cta" onClick={() => setOpen(false)}>
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
