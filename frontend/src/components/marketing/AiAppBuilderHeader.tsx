'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

import { Logo } from '@/components/layout/Logo';

import styles from './AiAppBuilderHero.module.css';

const NAV_ITEMS = [
  {
    href: '/features',
    label: 'Product',
  },
  {
    href: '/showcase',
    label: 'Templates',
  },
  {
    href: '/integrations',
    label: 'Integrations',
  },
  {
    href: '/pricing',
    label: 'Pricing',
  },
  {
    href: '/docs',
    label: 'Docs',
  },
  {
    href: '/research',
    label: 'Research',
  },
] as const;

export function AiAppBuilderHeader() {
  const [open, setOpen] =
    useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.headerShell}>
        <div className={styles.headerInner}>
          <Logo
            href="/"
            variant="homepage"
            height={35}
            className={styles.brand}
          />

          <nav
            className={styles.desktopNav}
            aria-label="AI App Builder navigation"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <Link
              href="/auth/login"
              className={styles.signIn}
            >
              Sign in
            </Link>

            <Link
              href="/auth/signup"
              className={styles.getStarted}
            >
              Get started free
            </Link>
          </div>

          <button
            type="button"
            className={styles.menuButton}
            aria-label={
              open
                ? 'Close navigation'
                : 'Open navigation'
            }
            aria-expanded={open}
            aria-controls="ai-app-builder-mobile-navigation"
            onClick={() =>
              setOpen((current) => !current)
            }
          >
            {open ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </button>
        </div>

        <div
          id="ai-app-builder-mobile-navigation"
          className={styles.mobileMenu}
          data-open={open}
        >
          <nav
            className={styles.mobileNav}
            aria-label="Mobile navigation"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.mobileNavLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.mobileActions}>
            <Link
              href="/auth/login"
              className={styles.mobileSignIn}
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>

            <Link
              href="/auth/signup"
              className={styles.mobileGetStarted}
              onClick={() => setOpen(false)}
            >
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
