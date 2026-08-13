import Link from 'next/link';
import { ArrowUpRight, Mail, Sparkles } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

const FOOTER_GROUPS = [
  {
    title: 'Build',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/crypto-builder', label: 'Crypto Builder' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { href: '/community', label: 'Community' },
      { href: '/docs', label: 'Docs' },
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/refund', label: 'Refund' },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="xv-marketing-footer">
      <div className="xv-marketing-footer__frame">
        <div className="xv-marketing-footer__lead">
          <div className="xv-marketing-footer__brand">
            <Logo href="/" variant="homepage" height={44} />
            <span className="xv-marketing-footer__status"><i /> Product loop online</span>
          </div>
          <p className="xv-marketing-footer__headline">
            Your idea. Your code.<br /><em>One continuous ship loop.</em>
          </p>
          <Link href="/auth/signup" className="xv-marketing-footer__cta">
            <Sparkles aria-hidden="true" /> Start building <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>

        <nav className="xv-marketing-footer__nav" aria-label="Footer navigation">
          {FOOTER_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`footer-${group.title.toLowerCase()}`}>
              <h2 id={`footer-${group.title.toLowerCase()}`}>{group.title}</h2>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}>{link.label}</Link>
              ))}
            </section>
          ))}
        </nav>

        <div className="xv-marketing-footer__base">
          <p>© {new Date().getFullYear()} XROGA AI. Build with evidence. Ship with ownership.</p>
          <a href="mailto:hello@xroga.com"><Mail aria-hidden="true" /> hello@xroga.com</a>
          <span>Independent AI coding agent</span>
        </div>
      </div>
    </footer>
  );
}
