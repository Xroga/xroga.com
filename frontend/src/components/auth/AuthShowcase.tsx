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
    position: '32% center',
  },
  {
    src: 'https://i.postimg.cc/W47PVnKh/image.png',
    alt: 'Explore worlds and learn deeper with Xroga',
    position: '32% center',
  },
  {
    src: 'https://i.postimg.cc/0NPLVSQQ/image.png',
    alt: 'Create together and move forward with Xroga',
    position: '34% center',
  },
  {
    src: 'https://i.postimg.cc/nLVnCgqq/image.png',
    alt: 'Dream bigger and ship brighter with Xroga',
    position: '34% center',
  },
  {
    src: 'https://i.postimg.cc/SKKpy8hx/image.png',
    alt: 'Code smarter and build stronger with Xroga AI',
    position: '35% center',
  },
  {
    src: 'https://i.postimg.cc/m2NxCVL8/image.png',
    alt: 'Move fast and stay ahead with Xroga AI',
    position: '35% center',
  },
  {
    src: 'https://i.postimg.cc/Vvqh9L89/image.png',
    alt: 'Discover wonder and rise beyond with Xroga',
    position: '32% center',
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
   * Preload every artwork immediately.
   * All seven also stay mounted below.
   */
  useEffect(() => {
    const images =
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
      images.forEach((image) => {
        image.onload =
          null;

        image.onerror =
          null;
      });
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
      window.setInterval(() => {
        setActiveIndex(
          (current) =>
            (current + 1) %
            AUTH_SLIDES.length
        );
      }, ROTATION_INTERVAL);

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
        bg-[#06101d]
      "
    >
      {AUTH_SLIDES.map(
        (
          slide,
          index
        ) => {
          const active =
            index ===
            activeIndex;

          return (
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              draggable={false}
              loading="eager"
              decoding="async"
              aria-hidden={!active}
              style={{
                objectPosition:
                  slide.position,
              }}
              className={[
                'absolute inset-0',
                'block h-full w-full',
                'object-cover',
                'select-none',
                'transition-[opacity,transform]',
                'duration-700 ease-out',

                active
                  ? 'z-10 scale-100 opacity-100'
                  : 'pointer-events-none z-0 scale-[1.01] opacity-0',
              ].join(' ')}
            />
          );
        }
      )}

      {/*
       * Very subtle edge treatment only.
       * This is NOT another background.
       */}
      <div
        aria-hidden
        className="
          pointer-events-none
          absolute
          inset-0
          z-[15]
          ring-1
          ring-inset
          ring-white/15
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

          shadow-[0_10px_30px_rgba(0,0,0,0.28)]
          backdrop-blur-xl

          transition-all
          duration-200

          opacity-80

          xl:opacity-0
          xl:group-hover:opacity-100

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

          shadow-[0_10px_30px_rgba(0,0,0,0.28)]
          backdrop-blur-xl

          transition-all
          duration-200

          opacity-80

          xl:opacity-0
          xl:group-hover:opacity-100

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
