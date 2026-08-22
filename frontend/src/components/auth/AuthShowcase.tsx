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

const ROTATION_INTERVAL = 7000;

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
    (index: number) => {
      const total =
        AUTH_SLIDES.length;

      setActiveIndex(
        ((index % total) + total) %
          total
      );
    },
    []
  );

  /*
   * Preload every slide immediately.
   *
   * All images also stay mounted below,
   * preventing blank frames between slides.
   */
  useEffect(() => {
    const preloaded =
      AUTH_SLIDES.map((slide) => {
        const image =
          new window.Image();

        image.src =
          slide.src;

        image.decoding =
          'async';

        return image;
      });

    return () => {
      preloaded.forEach(
        (image) => {
          image.onload =
            null;

          image.onerror =
            null;
        }
      );
    };
  }, []);

  useEffect(() => {
    if (
      paused ||
      reducedMotion
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setActiveIndex(
            (current) =>
              (current + 1) %
              AUTH_SLIDES.length
          );
        },
        ROTATION_INTERVAL
      );

    return () => {
      window.clearInterval(
        timer
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
      "
    >
      {AUTH_SLIDES.map(
        (slide, index) => {
          const active =
            index === activeIndex;

          return (
            <img
              key={
                slide.src
              }
              src={
                slide.src
              }
              alt={
                slide.alt
              }
              draggable={
                false
              }
              loading="eager"
              decoding="async"
              aria-hidden={
                !active
              }
              className={[
                'absolute inset-0',

                'h-full w-full',

                /*
                 * Image card is square,
                 * matching the artwork.
                 *
                 * Therefore object-cover fills
                 * the card without ugly side
                 * backgrounds and without
                 * significantly cropping the
                 * original square artwork.
                 */
                'object-cover object-center',

                'select-none',

                'transition-opacity',
                'duration-700',
                'ease-out',

                active
                  ? 'z-10 opacity-100'
                  : 'pointer-events-none z-0 opacity-0',
              ].join(' ')}
            />
          );
        }
      )}

      <div
        aria-hidden
        className="
          pointer-events-none
          absolute
          inset-0
          z-[15]
          rounded-[26px]
          ring-1
          ring-inset
          ring-white/20
        "
      />

      <button
        type="button"
        aria-label="Previous image"
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
          h-11
          w-11

          -translate-y-1/2
          place-items-center

          rounded-full

          border
          border-white/20

          bg-black/45
          text-white

          opacity-0

          shadow-lg
          backdrop-blur-xl

          transition-all
          duration-200

          group-hover:opacity-100

          hover:scale-105
          hover:bg-black/65

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

      <button
        type="button"
        aria-label="Next image"
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
          h-11
          w-11

          -translate-y-1/2
          place-items-center

          rounded-full

          border
          border-white/20

          bg-black/45
          text-white

          opacity-0

          shadow-lg
          backdrop-blur-xl

          transition-all
          duration-200

          group-hover:opacity-100

          hover:scale-105
          hover:bg-black/65

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
