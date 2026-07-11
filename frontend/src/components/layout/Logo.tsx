'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ProcessingLogo } from './ProcessingLogo';

interface LogoProps {
  href?: string;
  height?: number;
  className?: string;
  variant?: 'header' | 'sidebar' | 'homepage';
  onClick?: () => void;
  /** Holographic morph while AI is processing */
  processing?: boolean;
}

export function Logo({
  href = '/dashboard',
  height = 50,
  className,
  variant = 'header',
  onClick,
  processing = false,
}: LogoProps) {
  const inner = (
    <ProcessingLogo
      variant={variant}
      height={height}
      processing={processing}
      className={cn('bg-transparent', className)}
      alt="Xroga"
    />
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className="inline-block bg-transparent" style={{ background: 'transparent' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
