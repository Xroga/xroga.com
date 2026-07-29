'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { cn } from '@/lib/utils';

export function AnimatedNavIcon({ Icon, className }: { Icon: ComponentType<{ className?: string }>; className?: string }) {
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    const key = 'xroga-nav-icon-intro';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setIntro(true);
    const timer = window.setTimeout(() => setIntro(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <span className={cn('xv-animated-nav-icon', intro && 'is-intro', className)} aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
}
