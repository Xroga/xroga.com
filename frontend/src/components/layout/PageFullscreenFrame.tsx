'use client';

import { useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageFullscreenFrameProps {
  children: React.ReactNode;
  className?: string;
}

export function PageFullscreenFrame({ children, className }: PageFullscreenFrameProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('xv-page-fullscreen-active', fullscreen);
    return () => document.body.classList.remove('xv-page-fullscreen-active');
  }, [fullscreen]);

  const toggle = (
    <button
      type="button"
      onClick={() => setFullscreen((v) => !v)}
      className="xv-footer-pill !text-xs flex items-center gap-1.5 shrink-0 !text-[var(--foreground)]"
      aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {fullscreen ? (
        <>
          <Minimize2 className="w-3.5 h-3.5" /> Exit fullscreen
        </>
      ) : (
        <>
          <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
        </>
      )}
    </button>
  );

  if (fullscreen) {
    return (
      <div className="xv-fullscreen-overlay fixed inset-0 z-[200] overflow-y-auto bg-[var(--background)] p-4 sm:p-6 lg:p-8">
        <div className="flex justify-end mb-4 sticky top-0 z-10">{toggle}</div>
        <div className={cn('max-w-6xl mx-auto', className)}>{children}</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-3 -mt-1">{toggle}</div>
      <div className={cn(className)}>{children}</div>
    </>
  );
}
