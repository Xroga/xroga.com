'use client';

import { useEffect, useState } from 'react';
import { DESKTOP_BG_SLIDESHOW, SLIDESHOW_INTERVAL_MS } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface DesktopBackgroundSlideshowProps {
  images?: readonly string[];
  intervalMs?: number;
  className?: string;
  overlayClassName?: string;
  enabled?: boolean;
  frozenIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}

export function DesktopBackgroundSlideshow({
  images = DESKTOP_BG_SLIDESHOW,
  intervalMs = SLIDESHOW_INTERVAL_MS,
  className,
  overlayClassName,
  enabled = true,
  frozenIndex = 0,
  onActiveIndexChange,
}: DesktopBackgroundSlideshowProps) {
  const [activeIndex, setActiveIndex] = useState(frozenIndex);

  useEffect(() => {
    if (!enabled) {
      setActiveIndex(frozenIndex);
    }
  }, [enabled, frozenIndex]);

  useEffect(() => {
    onActiveIndexChange?.(activeIndex);
  }, [activeIndex, onActiveIndexChange]);

  useEffect(() => {
    if (!enabled || images.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, images, intervalMs]);

  const displayIndex = enabled ? activeIndex : frozenIndex;

  return (
    <div className={cn('fixed inset-0 -z-10 hidden md:block overflow-hidden', className)} aria-hidden>
      {images.map((src, index) => (
        <div
          key={src}
          className={cn(
            'absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed transition-opacity duration-[900ms] ease-out',
            index === displayIndex ? 'opacity-100' : 'opacity-0'
          )}
          style={{ backgroundImage: `url("${src}")` }}
        />
      ))}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/55 pointer-events-none',
          overlayClassName
        )}
      />
    </div>
  );
}
