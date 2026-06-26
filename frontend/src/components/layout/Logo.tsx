import Image from 'next/image';
import Link from 'next/link';
import { LOGO_URL } from '@/lib/plans';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizes = { sm: 28, md: 36, lg: 48 };

export function Logo({ href = '/dashboard', size = 'md', showText = true, className }: LogoProps) {
  const px = sizes[size];

  const inner = (
    <div className={cn('flex items-center gap-2.5 group', className)}>
      <div className="relative glow-green rounded-lg">
        <Image
          src={LOGO_URL}
          alt="Xroga"
          width={px}
          height={px}
          className="object-contain drop-shadow-[0_0_12px_rgba(0,255,136,0.5)]"
          unoptimized
        />
      </div>
      {showText && (
        <span className="text-xl font-bold gradient-text tracking-tight">XROGA</span>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
