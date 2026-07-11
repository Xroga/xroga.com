'use client';

import Image from 'next/image';
import Link from 'next/link';
import { HEADER_LOGO_URL, SIDEBAR_LOGO_URL, HOMEPAGE_LOGO_URL } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string | null;
  height?: number;
  className?: string;
  variant?: 'header' | 'sidebar' | 'homepage';
  onClick?: () => void;
}

export function Logo({ href = '/dashboard', height = 50, className, variant = 'header', onClick }: LogoProps) {
  const src =
    variant === 'homepage' ? HOMEPAGE_LOGO_URL : variant === 'sidebar' ? SIDEBAR_LOGO_URL : HEADER_LOGO_URL;
  const width = variant === 'homepage' ? height * 2.8 : variant === 'header' ? height * 2.2 : height * 1.1;

  const inner = (
    <div
      className={cn('relative bg-transparent', className)}
      style={{ height, width, background: 'transparent' }}
    >
      <Image
        src={src}
        alt="Xroga"
        fill
        className="object-contain object-left"
        style={{ background: 'transparent' }}
        unoptimized
        priority
      />
    </div>
  );

  if (href != null && href !== '') {
    return (
      <Link href={href} onClick={onClick} className="inline-block bg-transparent" style={{ background: 'transparent' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
