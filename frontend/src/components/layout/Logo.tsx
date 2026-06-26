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
    <div className={cn('relative glow-frozen', className)} style={{ height, width: height * 2.2 }}>
      <Image
        src={LOGO_URL}
        alt="Xroga"
        fill
        className="object-contain object-left drop-shadow-[0_0_16px_rgba(0,212,255,0.4)]"
        unoptimized
        priority
      />
    </div>
  );

  if (href) {
    return <Link href={href} className="inline-block">{inner}</Link>;
  }
  return inner;
}
