'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  HEADER_LOGO_URL,
  HOMEPAGE_LOGO_URL,
  SIDEBAR_FULL_LOGO_URL,
  SIDEBAR_LOGO_URL,
} from '@/lib/theme';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string | null;
  height?: number;
  className?: string;
  variant?: 'header' | 'sidebar' | 'sidebarFull' | 'homepage';
  onClick?: () => void;
}

export function Logo({ href = '/dashboard', height = 50, className, variant = 'header', onClick }: LogoProps) {
  const src = variant === 'homepage'
    ? HOMEPAGE_LOGO_URL
    : variant === 'sidebarFull'
      ? SIDEBAR_FULL_LOGO_URL
      : variant === 'sidebar'
        ? SIDEBAR_LOGO_URL
        : HEADER_LOGO_URL;
  // Wide wordmarks retain their natural banner space; the folded rail stays square.
  const width =
    variant === 'homepage'
      ? height * 3.6
      : variant === 'header'
        ? height * 3.2
        : variant === 'sidebarFull'
          ? height * 2
          : height;

  const inner = (
    <div
      className={cn('relative bg-transparent', className)}
      // `maxWidth` belongs beside `width` rather than in a stylesheet: the width is an
      // inline style, so no class can cap it, and an uncapped logo overflowed its
      // container — in the sidebar it ran underneath the utility card and showed
      // through behind the first icon. A logo should never be wider than its box.
      style={{ height, width, maxWidth: '100%', background: 'transparent' }}
    >
      <Image
        src={src}
        alt="Xroga"
        width={Math.round(width)}
        height={Math.round(height)}
        className="object-contain object-left h-full w-full"
        style={{ background: 'transparent' }}
        unoptimized={src.startsWith('http')}
        priority
      />
    </div>
  );

  if (href != null && href !== '') {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-label="Xroga"
        className="inline-block bg-transparent"
        // The link is the box the logo actually sits in, so it has to be capped too —
        // capping only the inner div measures 100% of an uncapped parent and changes
        // nothing.
        style={{ background: 'transparent', maxWidth: '100%', minWidth: 0 }}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
