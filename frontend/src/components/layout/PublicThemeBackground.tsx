'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { hasPublicImageBackground, isPublicMarketingPath } from '@/lib/publicMarketing';

export function PublicThemeBackground() {
  const pathname = usePathname();

  useEffect(() => {
    const isPublic = isPublicMarketingPath(pathname);
    document.body.classList.toggle('xv-public-theme', isPublic);
    document.body.classList.toggle('xv-public-image-background', isPublic && hasPublicImageBackground(pathname));

    return () => document.body.classList.remove('xv-public-theme', 'xv-public-image-background');
  }, [pathname]);

  return null;
}
