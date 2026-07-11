'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { AI_RESPONSE_LOGO_URL, HEADER_LOGO_URL, SIDEBAR_LOGO_URL, HOMEPAGE_LOGO_URL } from '@/lib/theme';

type LogoVariant = 'header' | 'sidebar' | 'homepage' | 'response';

const VARIANT_SRC: Record<LogoVariant, string> = {
  header: HEADER_LOGO_URL,
  sidebar: SIDEBAR_LOGO_URL,
  homepage: HOMEPAGE_LOGO_URL,
  response: AI_RESPONSE_LOGO_URL,
};

interface ProcessingLogoProps {
  processing?: boolean;
  height?: number;
  className?: string;
  variant?: LogoVariant;
  alt?: string;
}

/** Xroga logo with holographic morph during AI processing — unique singularity shape cycle */
export function ProcessingLogo({
  processing = false,
  height = 32,
  className,
  variant = 'response',
  alt = 'Xroga',
}: ProcessingLogoProps) {
  const width = variant === 'homepage' ? height * 2.8 : variant === 'header' ? height * 2.2 : height;

  return (
    <div
      className={cn(
        'xv-processing-logo relative inline-flex items-center justify-center shrink-0',
        processing && 'xv-processing-logo--active',
        className
      )}
      style={{ width, height }}
      aria-hidden={alt === ''}
    >
      <div className="xv-processing-logo__aura" aria-hidden />
      <div className="xv-processing-logo__orbit" aria-hidden />
      <div className="xv-processing-logo__holo" aria-hidden />
      <div className={cn('xv-processing-logo__frame', processing && 'xv-processing-logo__frame--morph')}>
        <Image
          src={VARIANT_SRC[variant]}
          alt={alt}
          fill
          className="object-contain object-center xv-processing-logo__img"
          unoptimized
        />
      </div>
    </div>
  );
}
