'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/onboarding') return;

    api.profile.onboardingStatus()
      .then(({ completed }) => {
        if (!completed) router.replace('/onboarding');
      })
      .catch(() => {});
  }, [pathname, router]);

  return <>{children}</>;
}
