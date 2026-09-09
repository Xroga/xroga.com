import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Mail } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { GitHubIcon } from '@/components/icons/GitHubIcon';

const FOOTER_GROUPS = [
  {
    title: 'Build',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/crypto', label: 'Crypto Builder' },
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

const FOOTER_PROMPTS = [
  { lead: 'What can I', tail: 'build for you?' },
  { lead: 'Build everything', tail: 'you can imagine.' },
  { lead: 'What can we', tail: 'ship today?' },
  { lead: 'Turn your idea', tail: 'into working software.' },
  { lead: 'From brief', tail: 'to verified release.' },
  { lead: 'Build boldly.', tail: 'Keep every change.' },
  { lead: 'Your next product', tail: 'starts here.' },
] as const;

export function MarketingFooter() {
  return (
    <footer className="xv-marketing-footer">
      <div className="xv-marketing-footer__stage">
        <section className="xv-marketing-footer__brand-card" aria-label="Xroga AI">
          <div className="xv-marketing-footer__brand-lockup">
            <Logo href="/" variant="homepage" height={42} className="xv-marketing-footer__full-logo" />
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
            <Image src="/brand/xroga-mark-192.png" width={92} height={92} alt="" />
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

        <p className="xv-marketing-footer__prompt" aria-label={`${FOOTER_PROMPTS[0].lead} ${FOOTER_PROMPTS[0].tail}`}>
          {FOOTER_PROMPTS.map((prompt) => (
            <span key={prompt.lead} aria-hidden="true"><b>{prompt.lead}</b> {prompt.tail}<i /></span>
          ))}
        </p>
      </div>
    </footer>
  );
}
