import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';

function XrogaVectorMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="Xroga X logo">
      <path d="M12 11h15l5 8 5-8h15L40.5 31.8 53 53H38l-6-9.5L26 53H11l12.6-21.2L12 11Z" fill="currentColor" />
      <path d="m25.4 25.1 6.6 10.5 6.6-10.5L32 14.8l-6.6 10.3Z" fill="currentColor" opacity=".58" />
    </svg>
  );
}

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
      <div className="xv-marketing-footer__stage">
        <section className="xv-marketing-footer__brand-card" aria-label="Xroga AI">
          <div className="xv-marketing-footer__brand-lockup">
            <span className="xv-marketing-footer__mini-mark"><XrogaVectorMark /></span>
            <strong>Xroga AI</strong>
          </div>
          <p>
            Software execution,<br />powered by <em>AI.</em>
          </p>
          <div className="xv-marketing-footer__social-row">
            <span>Stay in touch</span>
            <a href="mailto:hello@xroga.com" aria-label="Email Xroga"><Mail aria-hidden="true" /></a>
            <a href="https://x.com/Xroga_AI" target="_blank" rel="noreferrer" aria-label="Xroga on X">𝕏</a>
            <a href="https://github.com/Xroga/xroga.com" target="_blank" rel="noreferrer" aria-label="Xroga on GitHub"><GitHubIcon aria-hidden="true" /></a>
          </div>
        </section>

        <section className="xv-marketing-footer__main-card">
          <div className="xv-marketing-footer__floating-mark" aria-hidden="true">
            <XrogaVectorMark />
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

          <div className="xv-marketing-footer__subscribe">
            <p><span>AI moves fast.</span>Stay ahead with Xroga.</p>
            <form action="/auth/signup" method="get">
              <label className="sr-only" htmlFor="footer-email">Email address</label>
              <input id="footer-email" name="email" type="email" autoComplete="email" placeholder="Enter email address" required />
              <button type="submit">Join Xroga <ArrowRight aria-hidden="true" /></button>
            </form>
          </div>

          <div className="xv-marketing-footer__base">
            <p>© {new Date().getFullYear()} XROGA AI. All rights reserved.</p>
            <span>Build with evidence. Ship with ownership.</span>
          </div>
        </section>

        <Link href="/" className="xv-marketing-footer__wordmark" aria-label="Xroga home">XROGA</Link>
      </div>
    </footer>
  );
}
