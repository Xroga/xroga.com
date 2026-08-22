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

    '--auth-panel': string;

    '--auth-card': string;

    '--auth-border': string;

    '--auth-border-strong': string;

    '--auth-text': string;

    '--auth-muted': string;

    '--auth-input': string;

    '--auth-input-hover': string;

    '--auth-soft': string;

    '--auth-shadow': string;

    '--auth-card-shadow': string;
  };

const AUTH_THEME_STYLES: Record<
  AuthTheme,
  AuthThemeStyle
> = {
  white: {
    '--auth-page':
      '#eef0f3',

    '--auth-shell':
      '#ffffff',

    '--auth-panel':
      '#f8f8f7',

    '--auth-card':
      'rgba(255,255,255,0.94)',

    '--auth-border':
      'rgba(15,23,42,0.10)',

    '--auth-border-strong':
      'rgba(15,23,42,0.18)',

    '--auth-text':
      '#111318',

    '--auth-muted':
      '#717784',

    '--auth-input':
      '#f8f8f7',

    '--auth-input-hover':
      '#ffffff',

    '--auth-soft':
      'rgba(15,23,42,0.045)',

    '--auth-shadow':
      '0 28px 80px rgba(30,41,59,0.12), 0 8px 24px rgba(30,41,59,0.05)',

    '--auth-card-shadow':
      '0 18px 50px rgba(30,41,59,0.07), 0 3px 12px rgba(30,41,59,0.04)',
  },

  beige: {
    '--auth-page':
      '#eee9df',

    '--auth-shell':
      '#fbf8f1',

    '--auth-panel':
      '#f7f2e9',

    '--auth-card':
      'rgba(255,252,246,0.96)',

    '--auth-border':
      'rgba(86,68,45,0.13)',

    '--auth-border-strong':
      'rgba(86,68,45,0.22)',

    '--auth-text':
      '#29231c',

    '--auth-muted':
      '#786d60',

    '--auth-input':
      '#f7f1e7',

    '--auth-input-hover':
      '#fffaf3',

    '--auth-soft':
      'rgba(86,68,45,0.055)',

    '--auth-shadow':
      '0 28px 80px rgba(73,58,40,0.13), 0 8px 24px rgba(73,58,40,0.06)',

    '--auth-card-shadow':
      '0 18px 48px rgba(73,58,40,0.08), 0 3px 12px rgba(73,58,40,0.04)',
  },

  gray: {
    '--auth-page':
      '#111214',

    '--auth-shell':
      '#18191c',

    '--auth-panel':
      '#151619',

    '--auth-card':
      'rgba(30,31,35,0.96)',

    '--auth-border':
      'rgba(255,255,255,0.09)',

    '--auth-border-strong':
      'rgba(255,255,255,0.17)',

    '--auth-text':
      '#f4f4f5',

    '--auth-muted':
      '#a1a4aa',

    '--auth-input':
      '#15161a',

    '--auth-input-hover':
      '#1d1e22',

    '--auth-soft':
      'rgba(255,255,255,0.05)',

    '--auth-shadow':
      '0 32px 90px rgba(0,0,0,0.44), 0 9px 26px rgba(0,0,0,0.26)',

    '--auth-card-shadow':
      '0 20px 55px rgba(0,0,0,0.26), 0 4px 14px rgba(0,0,0,0.18)',
  },

  black: {
    '--auth-page':
      '#000000',

    '--auth-shell':
      '#08090b',

    '--auth-panel':
      '#050608',

    '--auth-card':
      'rgba(12,13,15,0.97)',

    '--auth-border':
      'rgba(255,255,255,0.09)',

    '--auth-border-strong':
      'rgba(255,255,255,0.18)',

    '--auth-text':
      '#f7f7f8',

    '--auth-muted':
      '#989ba2',

    '--auth-input':
      '#07080a',

    '--auth-input-hover':
      '#101114',

    '--auth-soft':
      'rgba(255,255,255,0.045)',

    '--auth-shadow':
      '0 34px 100px rgba(0,0,0,0.70), 0 10px 30px rgba(0,0,0,0.42)',

    '--auth-card-shadow':
      '0 22px 60px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.30)',
  },
};

function resolveAuthTheme(
  theme: string
): AuthTheme {
  if (
    theme ===
      'white' ||
    theme ===
      'beige' ||
    theme ===
      'gray' ||
    theme ===
      'black'
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
  const storedTheme =
    useThemeStore(
      (state) =>
        state.theme
    );

  const theme =
    resolveAuthTheme(
      storedTheme
    );

  return (
    <main
      data-auth-theme={
        theme
      }
      style={
        AUTH_THEME_STYLES[
          theme
        ]
      }
      className="
        bg-[var(--auth-page)]
        text-[var(--auth-text)]
        transition-colors
        duration-300

        lg:h-[100dvh]
        lg:overflow-hidden
        lg:p-3

        max-lg:min-h-[100dvh]
        max-lg:p-3
      "
    >
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

          lg:h-full
          lg:grid-cols-[minmax(0,1.08fr)_minmax(560px,0.92fr)]

          max-lg:min-h-[calc(100dvh-24px)]
          max-lg:grid-cols-1
        "
      >
        {/*
          IMAGE SIDE
        */}
        <div
          className="
            min-h-0
            min-w-0

            lg:h-full
            lg:p-3

            max-lg:h-[500px]
            max-lg:p-2.5
          "
        >
          <AuthShowcase />
        </div>

        {/*
          FORM SIDE
        */}
        <section
          className="
            relative
            flex
            min-h-0
            min-w-0
            items-center
            justify-center
            bg-[var(--auth-panel)]
            px-6
            py-5
            transition-colors
            duration-300

            lg:h-full

            xl:px-10

            max-lg:px-5
            max-lg:py-8
          "
        >
          <div
            aria-hidden
            className="
              pointer-events-none
              absolute
              inset-0
            "
            style={{
              background:
                `
                radial-gradient(
                  circle at 88% 7%,
                  rgba(0,106,255,0.09),
                  transparent 26%
                )
                `,
            }}
          />

          {/*
            This is now a REAL modern auth card.

            Before, the form was floating naked in
            the huge right-side surface, which made
            every control look small and distributed.
          */}
          <div
            className="
              relative
              z-10
              w-full
              max-w-[610px]
              rounded-[28px]
              border
              border-[var(--auth-border)]
              bg-[var(--auth-card)]
              p-6
              shadow-[var(--auth-card-shadow)]
              backdrop-blur-xl

              sm:p-7
            "
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
