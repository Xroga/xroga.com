'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { ExpandIcon } from '@/components/icons/animated/ExpandIcon';
import { MinimizeIcon } from '@/components/icons/animated/MinimizeIcon';

interface PageFullscreenFrameProps {
  children: React.ReactNode;
  className?: string;
  showToggle?: boolean;
}

type PageFullscreenContextValue = {
  fullscreen: boolean;
  toggle: () => void;
};

const PageFullscreenContext = createContext<PageFullscreenContextValue | null>(null);

export function PageFullscreenToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const context = useContext(PageFullscreenContext);
  if (!context) return null;

  const { fullscreen, toggle } = context;

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        compact
          ? 'xv-plugin-fullscreen-btn inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold'
          : 'xv-footer-pill !text-xs flex items-center gap-1.5 shrink-0 !text-[var(--foreground)]',
        className,
      )}
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
}

export function PageFullscreenFrame({
  children,
  className,
  showToggle = true,
}: PageFullscreenFrameProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('xv-page-fullscreen-active', fullscreen);
    return () => document.body.classList.remove('xv-page-fullscreen-active');
  }, [fullscreen]);

  const value = useMemo<PageFullscreenContextValue>(
    () => ({
      fullscreen,
      toggle: () => setFullscreen((current) => !current),
    }),
    [fullscreen],
  );

  const content = (
    <PageFullscreenContext.Provider value={value}>
      {showToggle ? (
        <div className={cn(fullscreen ? 'flex justify-end mb-4 sticky top-0 z-10' : 'flex justify-end mb-3 -mt-1')}>
          <PageFullscreenToggle />
        </div>
      ) : null}
      <div className={cn(fullscreen ? 'max-w-6xl mx-auto' : undefined, className)}>
        {children}
      </div>
    </PageFullscreenContext.Provider>
  );

  if (fullscreen) {
    return (
      <div className="xv-fullscreen-overlay fixed inset-0 z-[200] overflow-y-auto bg-[var(--background)] p-4 sm:p-6 lg:p-8">
        {content}
      </div>
    );
  }

  return content;
}
