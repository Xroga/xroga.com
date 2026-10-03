'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  DARK_SURFACE_WORDMARK_LOGO_URL,
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
  // The supplied wordmark is an 8:3 transparent banner; the folded rail stays square.
  const width =
    variant === 'homepage'
      ? height * (8 / 3)
      : variant === 'header'
        ? height * (8 / 3)
        : variant === 'sidebarFull'
          ? height * (8 / 3)
          : height;
  const usesWordmark = variant !== 'sidebar';

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
        className={cn(
          'object-contain object-left h-full w-full',
          usesWordmark && 'xv-brand-wordmark xv-brand-wordmark--light-surface',
        )}
        style={{ background: 'transparent' }}
        unoptimized={src.startsWith('http')}
        priority
      />
      {usesWordmark ? (
        <Image
          src={DARK_SURFACE_WORDMARK_LOGO_URL}
          alt=""
          aria-hidden="true"
          width={Math.round(width)}
          height={Math.round(height)}
          className="xv-brand-wordmark xv-brand-wordmark--dark-surface absolute inset-0 h-full w-full object-contain object-left"
          priority
        />
      ) : null}
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
