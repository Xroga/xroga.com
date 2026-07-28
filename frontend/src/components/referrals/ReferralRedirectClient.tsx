'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storeReferralCode } from '@/lib/referralStorage';

export function ReferralRedirectClient({ code }: { code: string }) {
  const router = useRouter();

  useEffect(() => {
    if (code) storeReferralCode(code);
    router.replace(`/auth/signup?ref=${encodeURIComponent(code)}`);
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
      <p className="text-sm text-white/70">Redirecting to sign up with referral {code}…</p>
    </div>
  );
}
