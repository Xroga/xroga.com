'use client';

import React, { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { isIconDomain } from '../../lib/siteIcon';

export function SourceLogo({ domain, size = 28, className = '' }: { domain: string; size?: number; className?: string }) {
  const hostname = domain.replace(/^www\./i, '').trim();
  const [failedDomain, setFailedDomain] = useState<string>();
  return <span className={className} aria-hidden="true" style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', flex: 'none', overflow: 'hidden' }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- Fixed-size raster from the existing bounded, cached icon route. */}
    {failedDomain === hostname || !isIconDomain(hostname) ? <Globe2 size={Math.round(size * .66)} strokeWidth={1.7} /> : <img
      src={`/api/site-icon?d=${encodeURIComponent(hostname)}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedDomain(hostname)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />}
  </span>;
}
