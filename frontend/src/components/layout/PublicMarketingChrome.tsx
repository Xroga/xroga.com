'use client';

import { usePathname } from 'next/navigation';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { PublicMarketingHeader } from '@/components/layout/PublicMarketingHeader';
import { isPublicMarketingPath } from '@/lib/publicMarketing';

export function PublicMarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isPublicMarketingPath(pathname)) return children;

  return (
    <div className="xv-public-marketing-shell">
      <PublicMarketingHeader />
      <div className="xv-public-marketing-content">{children}</div>
      <MarketingFooter />
    </div>
  );
}
