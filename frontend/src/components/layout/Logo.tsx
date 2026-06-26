import Image from 'next/image';
import Link from 'next/link';
import { LOGO_URL, SIDEBAR_COLLAPSED_LOGO_URL } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string;
  height?: number;
  className?: string;
  variant?: 'header' | 'sidebar' | 'collapsed';
}

export function Logo({ href = '/dashboard', height = 50, className, variant = 'header' }: LogoProps) {
  const src = variant === 'collapsed' ? SIDEBAR_COLLAPSED_LOGO_URL : LOGO_URL;
  const width = variant === 'collapsed' ? height : height * 2.2;

  const inner = (
    <div
      className={cn('relative', variant !== 'collapsed' && 'glow-frozen', className)}
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

  if (href) {
    return (
      <Link href={href} className="inline-block" style={{ background: 'transparent' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
