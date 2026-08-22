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
    '--auth-page':
      '#eef0f3',

    '--auth-shell':
      '#ffffff',

    '--auth-panel':
      '#ffffff',

    '--auth-border':
      'rgba(15, 23, 42, 0.10)',

    '--auth-border-strong':
      'rgba(15, 23, 42, 0.18)',

    '--auth-text':
      '#111318',

    '--auth-muted':
      '#747b86',

    '--auth-input':
      '#f8f9fa',

    '--auth-input-hover':
      '#ffffff',

    '--auth-soft':
      'rgba(15, 23, 42, 0.045)',

    '--auth-shadow':
      '0 24px 70px rgba(30,41,59,0.12), 0 7px 20px rgba(30,41,59,0.05)',
  },

  beige: {
    '--auth-page':
      '#eee9df',

    '--auth-shell':
      '#fbf7ef',

    '--auth-panel':
      '#fbf7ef',

    '--auth-border':
      'rgba(86,68,45,0.13)',

    '--auth-border-strong':
      'rgba(86,68,45,0.22)',

    '--auth-text':
      '#29231c',

    '--auth-muted':
      '#786d60',

    '--auth-input':
      '#f5efe5',

    '--auth-input-hover':
      '#fffaf2',

    '--auth-soft':
      'rgba(86,68,45,0.055)',

    '--auth-shadow':
      '0 24px 70px rgba(73,58,40,0.13), 0 7px 20px rgba(73,58,40,0.06)',
  },

  gray: {
    '--auth-page':
      '#111214',

    '--auth-shell':
      '#1a1b1e',

    '--auth-panel':
      '#1a1b1e',

    '--auth-border':
      'rgba(255,255,255,0.09)',

    '--auth-border-strong':
      'rgba(255,255,255,0.17)',

    '--auth-text':
      '#f4f4f5',

    '--auth-muted':
      '#a1a4aa',

    '--auth-input':
      '#141518',

    '--auth-input-hover':
      '#1e1f23',

    '--auth-soft':
      'rgba(255,255,255,0.05)',

    '--auth-shadow':
      '0 28px 80px rgba(0,0,0,0.42), 0 8px 24px rgba(0,0,0,0.24)',
  },

  black: {
    '--auth-page':
      '#000000',

    '--auth-shell':
      '#090a0c',

    '--auth-panel':
      '#090a0c',

    '--auth-border':
      'rgba(255,255,255,0.09)',

    '--auth-border-strong':
      'rgba(255,255,255,0.18)',

    '--auth-text':
      '#f7f7f8',

    '--auth-muted':
      '#989ba2',

    '--auth-input':
      '#050608',

    '--auth-input-hover':
      '#101114',

    '--auth-soft':
      'rgba(255,255,255,0.045)',

    '--auth-shadow':
      '0 30px 90px rgba(0,0,0,0.68), 0 10px 28px rgba(0,0,0,0.40)',
  },
};

function resolveAuthTheme(
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
        lg:p-4

        max-lg:min-h-[100dvh]
        max-lg:p-3
      "
    >
      <div
        className="
          mx-auto
          grid
          w-full
          max-w-[1500px]
          overflow-hidden
          rounded-[30px]
          border
          border-[var(--auth-border)]
          bg-[var(--auth-shell)]
          shadow-[var(--auth-shadow)]

          lg:h-full
          lg:grid-cols-[minmax(0,1.08fr)_minmax(430px,0.92fr)]

          max-lg:min-h-[calc(100dvh-24px)]
          max-lg:grid-cols-1
        "
      >
        {/* IMAGE PANEL */}
        <div
          className="
            min-h-0
            min-w-0

            lg:h-full
            lg:p-3

            max-lg:h-[420px]
            max-lg:p-2.5
          "
        >
          <AuthShowcase />
        </div>

        {/* FORM PANEL */}
        <section
          className="
            relative
            flex
            min-h-0
            min-w-0
            items-center
            justify-center
            overflow-hidden
            bg-[var(--auth-panel)]
            transition-colors
            duration-300

            lg:h-full
            lg:px-10
            lg:py-4

            xl:px-14

            max-lg:px-5
            max-lg:py-8
          "
        >
          {/* Very subtle Xroga-blue atmosphere */}
          <div
            aria-hidden
            className="
              pointer-events-none
              absolute
              inset-0
              opacity-65
            "
            style={{
              background:
                'radial-gradient(circle at 88% 8%, rgba(0,106,255,0.07), transparent 25%)',
            }}
          />

          <div
            className="
              relative
              z-10
              w-full
              max-w-[500px]
            "
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
