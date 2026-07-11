'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomeSignInButton } from '@/components/ui/XrogaButtons';

interface HomepageFloatingHeaderProps {
  loggedIn: boolean;
}

export function HomepageFloatingHeader({ loggedIn }: HomepageFloatingHeaderProps) {
  const router = useRouter();

  return (
    <header className="xv-float-header-wrap sticky top-0 z-50 px-4 pt-4 sm:pt-5 pb-2">
      <div className="xv-float-header-pill max-w-3xl mx-auto">
        <Link href="/" className="xv-float-header-brand">
          <Logo href={null} variant="homepage" height={34} className="!w-[88px] !h-[34px]" />
          <span className="xv-float-header-name">XROGA</span>
        </Link>

        <div className="xv-float-header-actions">
          {loggedIn ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="xv-float-header-cta"
            >
              Dashboard
            </button>
          ) : (
            <>
              <HomeSignInButton
                onClick={() => router.push('/auth/login')}
                className="xv-float-header-signin !min-h-[40px] !min-w-[120px] !text-[11px]"
              >
                Sign In
              </HomeSignInButton>
              <button
                type="button"
                onClick={() => router.push('/auth/signup')}
                className="xv-float-header-cta"
              >
                Get Started
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
