import Image from 'next/image';
import Link from 'next/link';
import { LOGO_URL } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string;
  height?: number;
  className?: string;
}

export function Logo({ href = '/dashboard', height = 50, className }: LogoProps) {
  const inner = (
    <div
      className={cn('relative', className)}
      style={{ height, width: height * 1.1, background: 'transparent' }}
    >
      <Image
        src={LOGO_URL}
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
      <Link href={href} className="inline-block bg-transparent" style={{ background: 'transparent' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
