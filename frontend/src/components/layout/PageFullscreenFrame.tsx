'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { ExpandIcon } from '@/components/icons/animated/ExpandIcon';
import { MinimizeIcon } from '@/components/icons/animated/MinimizeIcon';

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
      className="xv-page-fullscreen-toggle"
      aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {fullscreen ? (
        <>
          <AnimatedIcon icon={MinimizeIcon} size={14} /> Exit fullscreen
        </>
      ) : (
        <>
          <AnimatedIcon icon={ExpandIcon} size={14} /> Fullscreen
        </>
      )}
    </button>
  );

  const frame = (
    <div className="xv-page-frame">
      <div className="xv-page-frame-toolbar">{toggle}</div>
      <div className={cn('xv-page-frame-content', className)}>{children}</div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="xv-fullscreen-overlay xv-page-fullscreen-stage fixed inset-0 z-[200]">
        <div className="xv-page-surface xv-page-surface--fullscreen">{frame}</div>
      </div>
    );
  }

  return frame;
}
