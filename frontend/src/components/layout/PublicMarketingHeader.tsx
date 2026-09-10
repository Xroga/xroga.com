'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, LogIn, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HomepageThemeSwitcher } from '@/components/companion/HomepageThemeSwitcher';
import { Logo } from '@/components/layout/Logo';
import { createClient } from '@/lib/supabase/client';
import { PUBLIC_MARKETING_NAV } from '@/lib/publicMarketing';

export function PublicMarketingHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      void createClient().auth.getSession().then(({ data }) => {
        if (active) setLoggedIn(Boolean(data.session));
      }).catch(() => { if (active) setLoggedIn(false); });
    } catch {
      setLoggedIn(false);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const accountHref = loggedIn ? '/workspace' : '/auth/login';

  return (
    <header className="xv-marketing-header" data-public-marketing-header>
      <div className="xv-marketing-header__inner">
        <Logo href="/" variant="homepage" height={58} className="xv-marketing-header__logo" />
        <nav className="xv-marketing-header__nav" aria-label="Primary navigation">
          {PUBLIC_MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="xv-marketing-header__actions">
          <HomepageThemeSwitcher />
          <button type="button" className="xv-marketing-header__account" onClick={() => router.push(accountHref)}>
            {loggedIn ? <LayoutGrid aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            <span>{loggedIn ? 'Dashboard' : 'Sign in'}</span>
          </button>
          {!loggedIn && <Link className="xv-marketing-button xv-marketing-button--primary xv-marketing-header__cta" href="/auth/signup">Start free</Link>}
          <button
            type="button"
            className="xv-marketing-header__menu-button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="xv-public-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div id="xv-public-mobile-menu" className="xv-marketing-mobile-menu" data-open={menuOpen}>
        <nav aria-label="Mobile navigation">
          {PUBLIC_MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="xv-marketing-mobile-menu__actions">
          <Link href={accountHref}>{loggedIn ? 'Dashboard' : 'Sign in'}</Link>
          {!loggedIn && <Link className="xv-marketing-button xv-marketing-button--primary" href="/auth/signup">Start free</Link>}
        </div>
      </div>
    </header>
  );
}
