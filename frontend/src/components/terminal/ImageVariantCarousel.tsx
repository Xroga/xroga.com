'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTO_SLIDE_MS = 5000;
const SWIPE_THRESHOLD = 48;

interface CarouselSlide {
  imageUrl: string;
  label?: string;
}

interface ImageVariantCarouselProps {
  slides: CarouselSlide[];
  activeIndex: number;
  onChange: (index: number) => void;
  aspectClass: string;
  alt?: string;
  onImageClick?: (url: string) => void;
  className?: string;
}

export function ImageVariantCarousel({
  slides,
  activeIndex,
  onChange,
  aspectClass,
  alt = 'Generated image',
  onImageClick,
  className,
}: ImageVariantCarouselProps) {
  const [autoPlay, setAutoPlay] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const safeIndex = count > 0 ? ((activeIndex % count) + count) % count : 0;
  const current = slides[safeIndex];

  const goTo = useCallback(
    (index: number) => {
      if (count < 2) return;
      const next = ((index % count) + count) % count;
      onChange(next);
    },
    [count, onChange],
  );

  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);
  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);

  const pauseAuto = useCallback(() => setAutoPlay(false), []);

  useEffect(() => {
    if (!autoPlay || count < 2) return;
    const id = setInterval(goNext, AUTO_SLIDE_MS);
    return () => clearInterval(id);
  }, [autoPlay, count, goNext, safeIndex]);

  function onTouchStart(e: React.TouchEvent) {
    pauseAuto();
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchDeltaX.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    touchDeltaX.current = (e.touches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
  }

  function onTouchEnd() {
    if (touchDeltaX.current > SWIPE_THRESHOLD) goPrev();
    else if (touchDeltaX.current < -SWIPE_THRESHOLD) goNext();
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }

  if (!current?.imageUrl) return null;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl bg-black/5 dark:bg-black/25 touch-pan-y',
          aspectClass,
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={() => onImageClick?.(current.imageUrl)}
          className="group block h-full w-full"
          aria-label="Open image editor"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.imageUrl}
            alt={alt}
            className="h-full w-full object-cover select-none"
            draggable={false}
            loading="lazy"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/15 transition-colors">
            <Wand2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-90 drop-shadow-lg transition-opacity" />
          </span>
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => {
                pauseAuto();
                goPrev();
              }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                pauseAuto();
                goNext();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
              {slides.map((s, i) => (
                <button
                  key={`dot-${s.imageUrl.slice(-12)}-${i}`}
                  type="button"
                  onClick={() => {
                    pauseAuto();
                    goTo(i);
                  }}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === safeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                  )}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>
            <span className="absolute top-2 right-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
              {safeIndex + 1}/{count}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
