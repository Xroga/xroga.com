import type { ReactNode } from 'react';
import Link from 'next/link';
import { COMPANY_CONTACT } from '@/lib/companyContact';

const LEGAL_NAV = [
  { href: '/about', label: 'About / Product' },
  { href: '/contact', label: 'Contact' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund', label: 'Refund' },
  { href: '/pricing', label: 'Pricing' },
] as const;

export function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← {COMPANY_CONTACT.brand}
          </Link>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]" aria-label="Legal">
            {LEGAL_NAV.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-[var(--foreground)]">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-6 text-sm leading-relaxed">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {children}
        <aside className="mt-10 rounded-xl border border-[var(--card-border)] px-4 py-4 space-y-2">
          <h2 className="text-sm font-semibold">Contact {COMPANY_CONTACT.brand}</h2>
          <p className="text-[var(--muted)]">
            Email:{' '}
            <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
              {COMPANY_CONTACT.email}
            </a>
          </p>
          <p className="text-[var(--muted)]">
            Phone:{' '}
            <a href={`tel:${COMPANY_CONTACT.phoneTel}`} className="text-[var(--accent)] hover:underline">
              {COMPANY_CONTACT.phoneDisplay}
            </a>
          </p>
          <p className="text-[var(--muted)]">Region: {COMPANY_CONTACT.region}</p>
          <p className="text-xs text-[var(--muted)] pt-1">
            Full contact page:{' '}
            <Link href="/contact" className="text-[var(--accent)] hover:underline">
              /contact
            </Link>
          </p>
        </aside>
      </main>
    </div>
  );
}
