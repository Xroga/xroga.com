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
  // Home/workspace logo is a wide transparent banner; sidebar stays square mark
  const width =
    variant === 'homepage' ? height * 3.6 : variant === 'header' ? height * 3.2 : height * 1.1;

  const inner = (
    <div
      className={cn('relative bg-transparent', className)}
      style={{ height, width, background: 'transparent' }}
    >
      <Image
        src={src}
        alt="Xroga"
        width={Math.round(width)}
        height={Math.round(height)}
        className="object-contain object-left h-full w-full"
        style={{ background: 'transparent' }}
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
