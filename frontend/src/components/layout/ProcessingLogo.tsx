'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AI_RESPONSE_LOGO_URL, HEADER_LOGO_URL, SIDEBAR_LOGO_URL, HOMEPAGE_LOGO_URL } from '@/lib/theme';

type LogoVariant = 'header' | 'sidebar' | 'homepage' | 'response';

const VARIANT_SRC: Record<LogoVariant, string> = {
  header: HEADER_LOGO_URL,
  sidebar: SIDEBAR_LOGO_URL,
  homepage: HOMEPAGE_LOGO_URL,
  response: AI_RESPONSE_LOGO_URL,
};

/** Always-visible SVG fallback if the PNG fails (never leave a blank AI avatar). */
function XrogaMarkFallback({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="xv-processing-logo__img"
      aria-hidden
    >
      <circle cx="16" cy="16" r="15" fill="#0b1220" />
      <circle cx="16" cy="16" r="10" stroke="#3b82f6" strokeWidth="2" fill="none" opacity="0.9" />
      <path
        d="M10 10 L22 22 M22 10 L10 22"
        stroke="#60a5fa"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ProcessingLogoProps {
  processing?: boolean;
  height?: number;
  className?: string;
  variant?: LogoVariant;
  alt?: string;
}

/** Xroga logo — local tiny asset so AI responses never wait on a remote megabyte PNG */
export function ProcessingLogo({
  processing = false,
  height = 32,
  className,
  variant = 'response',
  alt = 'Xroga',
}: ProcessingLogoProps) {
  const [failed, setFailed] = useState(false);
  const width = variant === 'homepage' ? height * 2.8 : variant === 'header' ? height * 2.2 : height;
  const src = VARIANT_SRC[variant];

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
        {failed ? (
          <XrogaMarkFallback size={Math.round(Math.min(width, height))} />
        ) : (
          <Image
            src={src}
            alt={alt}
            width={Math.round(width)}
            height={Math.round(height)}
            className="object-contain object-center xv-processing-logo__img"
            priority={variant === 'response' || variant === 'sidebar'}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
