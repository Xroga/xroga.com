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
   * Load all seven images immediately.
   *
   * This prevents a black/empty frame when
   * the carousel switches to the next slide.
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
      images.forEach(
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

    const interval =
      window.setInterval(
        () => {
          setActiveIndex(
            (current) =>
              (current + 1) %
              AUTH_SLIDES.length
          );
        },
        ROTATION_INTERVAL_MS
      );

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
        rounded-[28px]
        bg-[#07101d]
      "
    >
      {AUTH_SLIDES.map(
        (slide, index) => {
          const active =
            index === activeIndex;

          return (
            <div
              key={
                slide.src
              }
              aria-hidden={
                !active
              }
              className={[
                'absolute inset-0',
                'overflow-hidden',
                'transition-opacity',
                'duration-700 ease-out',

                active
                  ? 'z-10 opacity-100'
                  : 'pointer-events-none z-0 opacity-0',
              ].join(' ')}
            >
              {/*
                BACKGROUND FILL

                This copy fills the entire panel so
                there can never be black letterboxing.
              */}
              <div
                aria-hidden
                className="
                  absolute
                  inset-[-28px]
                  scale-110
                  bg-cover
                  bg-center
                  blur-[22px]
                "
                style={{
                  backgroundImage:
                    `url("${slide.src}")`,
                }}
              />

              {/*
                Slight dark treatment keeps the
                background fill from competing with
                the real artwork.
              */}
              <div
                aria-hidden
                className="
                  absolute
                  inset-0
                  bg-black/20
                "
              />

              {/*
                FOREGROUND IMAGE

                object-contain is intentional here.

                Because the blurred background already
                fills the panel, we can now show the
                ENTIRE original artwork without black
                bars and without cropping the Xroga
                logo or bottom text.
              */}
              <img
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
                className="
                  absolute
                  inset-0
                  h-full
                  w-full
                  select-none
                  object-contain
                  object-center
                "
              />
            </div>
          );
        }
      )}

      {/*
        Very subtle frame around artwork.
      */}
      <div
        aria-hidden
        className="
          pointer-events-none
          absolute
          inset-0
          z-[15]
          rounded-[28px]
          ring-1
          ring-inset
          ring-white/20
        "
      />

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
          left-5
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
          bg-[#06101f]/60
          text-white
          opacity-0
          shadow-[0_8px_24px_rgba(0,0,0,0.25)]
          backdrop-blur-xl
          transition-all
          duration-200

          group-hover:opacity-100

          hover:scale-105
          hover:bg-[#06101f]/80

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
        aria-label="Next Xroga image"
        onClick={() =>
          goTo(
            activeIndex + 1
          )
        }
        className="
          absolute
          right-5
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
          bg-[#06101f]/60
          text-white
          opacity-0
          shadow-[0_8px_24px_rgba(0,0,0,0.25)]
          backdrop-blur-xl
          transition-all
          duration-200

          group-hover:opacity-100

          hover:scale-105
          hover:bg-[#06101f]/80

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
