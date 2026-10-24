'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Globe2 } from 'lucide-react';

const faviconLoader = ({ src }: { src: string }) => src;

export function SourceLogo({ domain, size = 28, className = '' }: { domain: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const hostname = domain.replace(/^www\./i, '').trim();
  return <span className={className} aria-hidden="true" style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', flex: 'none', overflow: 'hidden' }}>
    {failed || !hostname ? <Globe2 size={Math.round(size * .66)} strokeWidth={1.7} /> : <Image
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
      alt=""
      width={size}
      height={size}
      loader={faviconLoader}
      unoptimized
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />}
  </span>;
}
