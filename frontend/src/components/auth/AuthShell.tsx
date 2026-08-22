'use client';

import type {
  CSSProperties,
  ReactNode,
} from 'react';

import { AuthShowcase } from './AuthShowcase';
import { useThemeStore } from '@/store/useThemeStore';

type AuthTheme =
  | 'white'
  | 'beige'
  | 'gray'
  | 'black';

type AuthThemeStyle =
  CSSProperties & {
    '--auth-page': string;
    '--auth-shell': string;
    '--auth-border': string;
    '--auth-border-strong': string;
    '--auth-text': string;
    '--auth-muted': string;
    '--auth-input': string;
    '--auth-input-hover': string;
    '--auth-soft': string;
    '--auth-shadow': string;
  };

const AUTH_THEME_STYLES: Record<
  AuthTheme,
  AuthThemeStyle
> = {
  white: {
    '--auth-page': '#f3f3f1',
    '--auth-shell': '#ffffff',

    '--auth-border':
      'rgba(15,23,42,0.10)',

    '--auth-border-strong':
      'rgba(15,23,42,0.18)',

    '--auth-text': '#111318',
    '--auth-muted': '#727782',

    '--auth-input': '#f7f7f5',
    '--auth-input-hover': '#ffffff',

    '--auth-soft':
      'rgba(15,23,42,0.045)',

    '--auth-shadow':
      '0 30px 90px rgba(30,41,59,0.12)',
  },

  beige: {
    '--auth-page': '#eee9df',
    '--auth-shell': '#fbf7ef',

    '--auth-border':
      'rgba(86,68,45,0.13)',

    '--auth-border-strong':
      'rgba(86,68,45,0.22)',

    '--auth-text': '#29231c',
    '--auth-muted': '#786d60',

    '--auth-input': '#f4eee4',
    '--auth-input-hover': '#fffaf2',

    '--auth-soft':
      'rgba(86,68,45,0.055)',

    '--auth-shadow':
      '0 30px 90px rgba(73,58,40,0.13)',
  },

  gray: {
    '--auth-page': '#111214',
    '--auth-shell': '#1a1b1e',

    '--auth-border':
      'rgba(255,255,255,0.09)',

    '--auth-border-strong':
      'rgba(255,255,255,0.17)',

    '--auth-text': '#f4f4f5',
    '--auth-muted': '#a1a4aa',

    '--auth-input': '#141518',
    '--auth-input-hover': '#202125',

    '--auth-soft':
      'rgba(255,255,255,0.05)',

    '--auth-shadow':
      '0 34px 100px rgba(0,0,0,0.44)',
  },

  black: {
    '--auth-page': '#000000',
    '--auth-shell': '#090a0c',

    '--auth-border':
      'rgba(255,255,255,0.09)',

    '--auth-border-strong':
      'rgba(255,255,255,0.18)',

    '--auth-text': '#f7f7f8',
    '--auth-muted': '#989ba2',

    '--auth-input': '#050608',
    '--auth-input-hover': '#101114',

    '--auth-soft':
      'rgba(255,255,255,0.045)',

    '--auth-shadow':
      '0 36px 110px rgba(0,0,0,0.70)',
  },
};

function resolveTheme(
  theme: string
): AuthTheme {
  if (
    theme === 'white' ||
    theme === 'beige' ||
    theme === 'gray' ||
    theme === 'black'
  ) {
    return theme;
  }

  return 'white';
}

export function AuthShell({
  children,
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  const currentTheme =
    useThemeStore(
      (state) => state.theme
    );

  const theme =
    resolveTheme(
      currentTheme
    );

  return (
    <main
      data-auth-theme={theme}
      style={
        AUTH_THEME_STYLES[
          theme
        ]
      }
      className="
        flex
        min-h-[100dvh]
        items-center
        justify-center

        bg-[var(--auth-page)]

        text-[var(--auth-text)]

        transition-colors
        duration-300

        lg:h-[100dvh]
        lg:overflow-hidden
        lg:p-3

        max-lg:p-3
      "
    >
      {/*
        ONE OUTER CARD ONLY.

        Image and auth form live directly
        inside the same container.
      */}
      <div
        className="
          mx-auto
          grid
          w-full
          max-w-[1580px]

          overflow-hidden

          rounded-[32px]

          border
          border-[var(--auth-border)]

          bg-[var(--auth-shell)]

          shadow-[var(--auth-shadow)]

          lg:h-[calc(100dvh-24px)]

          lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.88fr)]

          max-lg:grid-cols-1
        "
      >
        {/*
          IMAGE

          IMPORTANT:
          NO padding.
          NO background.
          NO second wrapper card.

          The image touches the outer card.
        */}
        <div
          className="
            relative
            min-h-0
            min-w-0
            overflow-hidden

            max-lg:aspect-square
            max-lg:w-full

            lg:h-full
          "
        >
          <AuthShowcase />
        </div>

        {/*
          FORM

          Also not a separate card.
          It sits directly inside the
          same outer auth surface.
        */}
        <section
          className="
            flex
            min-h-0
            min-w-0

            items-center
            justify-center

            bg-[var(--auth-shell)]

            px-6
            py-8

            sm:px-8

            lg:h-full
            lg:px-10
            lg:py-6

            xl:px-14
          "
        >
          <div
            className="
              w-full
              max-w-[610px]
            "
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
