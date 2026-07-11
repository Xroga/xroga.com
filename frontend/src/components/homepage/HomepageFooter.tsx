'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Infinity, Mail } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { PowerSmashButton } from '@/components/ui/XrogaButtons';

const PLATFORM_LINKS = [
  { href: '/features/xroga-workspace', label: 'Workspace' },
  { href: '/features/community-hub', label: 'Community' },
  { href: '/features/earn-xrg-referrals', label: 'Earn XRG' },
  { href: '/features', label: 'All Features' },
  { href: '/pricing', label: 'Pricing' },
];

const INFO_LINKS = [
  { href: '/about', label: 'About Xroga' },
  { href: '/docs/api', label: 'API Docs' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export function HomepageFooter() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function handleNewsletter(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      router.push(`/auth/signup?email=${encodeURIComponent(email.trim())}`);
    }
  }

  return (
    <footer className="relative z-10 mt-auto">
      {/* CTA band with holographic vortex */}
      <section className="relative overflow-hidden py-16 sm:py-20 px-4">
        <div className="xv-footer-vortex" aria-hidden />
        <div className="relative z-[1] max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
            Start building on Xroga
          </h2>
          <p className="text-sm sm:text-base text-white/50 mb-8 max-w-md mx-auto leading-relaxed">
            The AI Swarm OS with 7M free tokens, community rewards, and a workspace that ships legendary apps.
          </p>
          <PowerSmashButton
            size="md"
            onClick={() => router.push('/auth/signup')}
            className="!bg-white !text-[#0a0e17] !border-white/20 !shadow-[0_20px_50px_rgba(74,122,255,0.35)] !normal-case !tracking-normal"
            icon={<ArrowRight className="w-4 h-4 !animate-none" />}
          >
            Start Now
          </PowerSmashButton>
        </div>
      </section>

      {/* Main footer grid */}
      <div className="border-t border-white/[0.06] bg-[#050508]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Logo href="/" variant="homepage" height={36} />
              </div>
              <p className="text-xs text-white/45 leading-relaxed max-w-xs">
                XROGA AI · Black Hole V
                <Infinity className="inline w-3 h-3 text-[#4a7aff] mx-0.5 align-text-bottom" />
                <br />
                Multi-agent swarm OS — tokens, not locks. Ship something legendary.
              </p>
            </div>

            {/* Platform */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/70 mb-4">Platform</h3>
              <ul className="space-y-2.5">
                {PLATFORM_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="xv-footer-nav-link">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Info */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/70 mb-4">Info</h3>
              <ul className="space-y-2.5">
                {INFO_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="xv-footer-nav-link">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/70 mb-4">Join Newsletter</h3>
              <p className="text-[11px] text-white/40 mb-3">Product drops, token boosts, and community updates.</p>
              <form onSubmit={handleNewsletter} className="xv-footer-newsletter">
                <Mail className="w-4 h-4 text-white/30 shrink-0 ml-3" aria-hidden />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="xv-footer-newsletter__input"
                  aria-label="Email for newsletter"
                />
                <button type="submit" className="xv-footer-newsletter__btn" aria-label="Subscribe">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              {subscribed && (
                <p className="text-[10px] text-[#4a7aff] mt-2">Redirecting to sign up…</p>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06] px-4 sm:px-8 py-4">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-white/35">
            <p>© {new Date().getFullYear()} Xroga AI · Muhammad Ibrahim · Pakistan</p>
            <p>
              We use cookies for a better experience.{' '}
              <button type="button" className="text-[#4a7aff] hover:underline" onClick={() => {}}>
                Accept
              </button>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
