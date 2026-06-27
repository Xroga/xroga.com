'use client';

import { useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

interface PageFullscreenFrameProps {
  children: React.ReactNode;
  className?: string;
}

export function PageFullscreenFrame({ children, className }: PageFullscreenFrameProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const widthPx = sidebarOpen ? sidebarWidth : 72;

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
      <div
        className="fixed z-[40] overflow-y-auto bg-transparent px-4 sm:px-6 lg:px-8"
        style={{
          top: '56px',
          bottom: '180px',
          left: `${widthPx}px`,
          right: 0,
        }}
      >
        <div className="flex justify-end mb-4 pt-1">{toggle}</div>
        <div className={cn(className)}>{children}</div>
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
