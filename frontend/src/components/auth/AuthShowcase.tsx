'use client';

import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

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

const ROTATION_INTERVAL_MS = 7000;

export function AuthShowcase() {
  const [activeIndex, setActiveIndex] =
    useState(0);

  const [paused, setPaused] =
    useState(false);

  const reducedMotion =
    useThemeStore(
      (state) => state.reducedMotion
    );

  const goTo = useCallback(
    (nextIndex: number) => {
      const total =
        AUTH_SLIDES.length;

      setActiveIndex(
        ((nextIndex % total) + total) %
          total
      );
    },
    []
  );

  /*
   * Preload every slide immediately.
   *
   * All seven images also remain mounted
   * in the DOM below, so changing slides
   * does not create/remount the next image.
   */
  useEffect(() => {
    const images =
      AUTH_SLIDES.map((slide) => {
        const image =
          new window.Image();

        image.src = slide.src;
        image.decoding = 'async';

        return image;
      });

    return () => {
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, []);

  useEffect(() => {
    if (
      reducedMotion ||
      paused
    ) {
      return;
    }

    const interval =
      window.setInterval(() => {
        setActiveIndex(
          (current) =>
            (current + 1) %
            AUTH_SLIDES.length
        );
      }, ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    paused,
    reducedMotion,
  ]);

  return (
    <section
      aria-label="Xroga inspiration"
      onPointerEnter={() =>
        setPaused(true)
      }
      onPointerLeave={() =>
        setPaused(false)
      }
      className="
        group
        relative
        h-full
        w-full
        overflow-hidden
        rounded-[26px]
        bg-[#07101d]
      "
    >
      {AUTH_SLIDES.map(
        (slide, index) => {
          const active =
            index === activeIndex;

          return (
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              draggable={false}
              loading="eager"
              decoding="async"
              aria-hidden={
                !active
              }
              className={[
                'absolute inset-0',
                'h-full w-full',
                /*
                 * IMPORTANT:
                 * object-cover fixes the
                 * black letterbox / blank
                 * area you were seeing.
                 */
                'object-cover object-center',
                'select-none',
                'transition-[opacity,transform]',
                'duration-700 ease-out',
                active
                  ? 'z-10 scale-100 opacity-100'
                  : 'pointer-events-none z-0 scale-[1.015] opacity-0',
              ].join(' ')}
            />
          );
        }
      )}

      {/* Permanent subtle inner border */}
      <div
        aria-hidden
        className="
          pointer-events-none
          absolute
          inset-0
          z-[11]
          rounded-[26px]
          ring-1
          ring-inset
          ring-white/15
        "
      />

      {/* Left control */}
      <button
        type="button"
        aria-label="Previous Xroga image"
        onClick={() =>
          goTo(
            activeIndex - 1
          )
        }
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
          bg-black/35
          text-white
          opacity-0
          shadow-lg
          backdrop-blur-md
          transition-all
          duration-200
          group-hover:opacity-100
          hover:scale-105
          hover:bg-black/55
          focus-visible:opacity-100
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-white/50
        "
      >
        <ChevronLeft
          className="h-5 w-5"
        />
      </button>

      {/* Right control */}
      <button
        type="button"
        aria-label="Next Xroga image"
        onClick={() =>
          goTo(
            activeIndex + 1
          )
        }
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
          bg-black/35
          text-white
          opacity-0
          shadow-lg
          backdrop-blur-md
          transition-all
          duration-200
          group-hover:opacity-100
          hover:scale-105
          hover:bg-black/55
          focus-visible:opacity-100
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-white/50
        "
      >
        <ChevronRight
          className="h-5 w-5"
        />
      </button>
    </section>
  );
}
