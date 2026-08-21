'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';

const AUTH_SLIDES = [
  {
    src: 'https://i.postimg.cc/q72v3yFz/image.png',
    alt: 'Learn more and build beyond with Xroga',
  },
  {
    src: 'https://i.postimg.cc/W47PVnKh/image.png',
    alt: 'Explore worlds and learn deeper with Xroga',
  },
  {
    src: 'https://i.postimg.cc/0NPLVSQQ/image.png',
    alt: 'Create together and move forward with Xroga',
  },
  {
    src: 'https://i.postimg.cc/nLVnCgqq/image.png',
    alt: 'Dream bigger and ship brighter with Xroga',
  },
  {
    src: 'https://i.postimg.cc/SKKpy8hx/image.png',
    alt: 'Code smarter and build stronger with Xroga AI',
  },
  {
    src: 'https://i.postimg.cc/m2NxCVL8/image.png',
    alt: 'Move fast and stay ahead with Xroga AI',
  },
  {
    src: 'https://i.postimg.cc/Vvqh9L89/image.png',
    alt: 'Discover wonder and rise beyond with Xroga',
  },
] as const;

const ROTATION_INTERVAL = 7000;

export function AuthShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const reducedMotion = useThemeStore((state) => state.reducedMotion);

  const goTo = useCallback((nextIndex: number) => {
    const total = AUTH_SLIDES.length;

    setActiveIndex(
      ((nextIndex % total) + total) % total
    );
  }, []);

  useEffect(() => {
    if (reducedMotion || paused) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex(
        (current) => (current + 1) % AUTH_SLIDES.length
      );
    }, ROTATION_INTERVAL);

    return () => {
      window.clearInterval(interval);
    };
  }, [paused, reducedMotion]);

  return (
    <section
      className="
        group
        relative
        h-full
        min-h-[360px]
        w-full
        overflow-hidden
        rounded-[24px]
        bg-[#06101d]
        sm:min-h-[480px]
        lg:min-h-[720px]
      "
      aria-label="Xroga inspiration"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {AUTH_SLIDES.map((slide, index) => {
        const active = index === activeIndex;

        return (
          <div
            key={slide.src}
            className={[
              'absolute inset-0 transition-all duration-700 ease-out',
              active
                ? 'z-10 scale-100 opacity-100'
                : 'pointer-events-none z-0 scale-[1.015] opacity-0',
            ].join(' ')}
            aria-hidden={!active}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={index === 0}
              unoptimized
              draggable={false}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="select-none object-contain"
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => goTo(activeIndex - 1)}
        aria-label="Previous Xroga image"
        className="
          absolute
          left-4
          top-1/2
          z-20
          grid
          h-10
          w-10
          -translate-y-1/2
          place-items-center
          rounded-full
          border
          border-white/20
          bg-black/30
          text-white
          opacity-75
          shadow-lg
          backdrop-blur-md
          transition-all
          duration-200
          hover:scale-105
          hover:bg-black/50
          hover:opacity-100
          lg:opacity-0
          lg:group-hover:opacity-100
        "
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => goTo(activeIndex + 1)}
        aria-label="Next Xroga image"
        className="
          absolute
          right-4
          top-1/2
          z-20
          grid
          h-10
          w-10
          -translate-y-1/2
          place-items-center
          rounded-full
          border
          border-white/20
          bg-black/30
          text-white
          opacity-75
          shadow-lg
          backdrop-blur-md
          transition-all
          duration-200
          hover:scale-105
          hover:bg-black/50
          hover:opacity-100
          lg:opacity-0
          lg:group-hover:opacity-100
        "
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </section>
  );
}
