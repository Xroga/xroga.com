'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PRIVATE_PREFIXES = ['/workspace', '/dashboard', '/admin', '/auth'];

export function PublicThemeBackground() {
  const pathname = usePathname();

  useEffect(() => {
    const isPreview = /^\/showcase\/[^/]+\/preview/.test(pathname);
    const isPrivate = PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    document.body.classList.toggle('xv-public-theme', !isPreview && !isPrivate);

    return () => document.body.classList.remove('xv-public-theme');
  }, [pathname]);

  return null;
}
