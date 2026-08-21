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

type AuthThemeStyle = CSSProperties & {
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

const AUTH_THEME_STYLES: Record<AuthTheme, AuthThemeStyle> = {
  white: {
    '--auth-page': '#eef0f3',
    '--auth-shell': '#ffffff',
    '--auth-panel': '#ffffff',

    '--auth-border': 'rgba(15, 23, 42, 0.10)',
    '--auth-border-strong': 'rgba(15, 23, 42, 0.18)',

    '--auth-text': '#111318',
    '--auth-muted': '#747b86',

    '--auth-input': '#f8f9fa',
    '--auth-input-hover': '#ffffff',

    '--auth-soft': 'rgba(15, 23, 42, 0.045)',

    '--auth-shadow':
      '0 30px 90px rgba(30, 41, 59, 0.13), 0 8px 24px rgba(30, 41, 59, 0.06)',
  },

  beige: {
    '--auth-page': '#eee9df',
    '--auth-shell': '#fbf7ef',
    '--auth-panel': '#fbf7ef',

    '--auth-border': 'rgba(86, 68, 45, 0.13)',
    '--auth-border-strong': 'rgba(86, 68, 45, 0.22)',

    '--auth-text': '#29231c',
    '--auth-muted': '#786d60',

    '--auth-input': '#f5efe5',
    '--auth-input-hover': '#fffaf2',

    '--auth-soft': 'rgba(86, 68, 45, 0.055)',

    '--auth-shadow':
      '0 30px 90px rgba(73, 58, 40, 0.14), 0 8px 24px rgba(73, 58, 40, 0.07)',
  },

  gray: {
    '--auth-page': '#111214',
    '--auth-shell': '#1a1b1e',
    '--auth-panel': '#1a1b1e',

    '--auth-border': 'rgba(255, 255, 255, 0.09)',
    '--auth-border-strong': 'rgba(255, 255, 255, 0.17)',

    '--auth-text': '#f4f4f5',
    '--auth-muted': '#a1a4aa',

    '--auth-input': '#141518',
    '--auth-input-hover': '#1e1f23',

    '--auth-soft': 'rgba(255, 255, 255, 0.05)',

    '--auth-shadow':
      '0 34px 100px rgba(0, 0, 0, 0.44), 0 10px 30px rgba(0, 0, 0, 0.25)',
  },

  black: {
    '--auth-page': '#000000',
    '--auth-shell': '#090a0c',
    '--auth-panel': '#090a0c',

    '--auth-border': 'rgba(255, 255, 255, 0.09)',
    '--auth-border-strong': 'rgba(255, 255, 255, 0.18)',

    '--auth-text': '#f7f7f8',
    '--auth-muted': '#989ba2',

    '--auth-input': '#050608',
    '--auth-input-hover': '#101114',

    '--auth-soft': 'rgba(255, 255, 255, 0.045)',

    '--auth-shadow':
      '0 36px 110px rgba(0, 0, 0, 0.70), 0 12px 32px rgba(0, 0, 0, 0.42)',
  },
};

function resolveAuthTheme(theme: string): AuthTheme {
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
  const currentTheme = useThemeStore((state) => state.theme);

  const theme = resolveAuthTheme(currentTheme);

  return (
    <main
      data-auth-theme={theme}
      style={AUTH_THEME_STYLES[theme]}
      className="
        min-h-[100dvh]
        bg-[var(--auth-page)]
        p-2.5
        text-[var(--auth-text)]
        transition-colors
        duration-300
        sm:p-4
        lg:p-6
      "
    >
      <div
        className="
          mx-auto
          grid
          min-h-[calc(100dvh-20px)]
          w-full
          max-w-[1380px]
          overflow-hidden
          rounded-[30px]
          border
          border-[var(--auth-border)]
          bg-[var(--auth-shell)]
          shadow-[var(--auth-shadow)]
          transition-colors
          duration-300

          sm:min-h-[calc(100dvh-32px)]

          lg:min-h-[calc(100dvh-48px)]
          lg:grid-cols-[minmax(0,1.05fr)_minmax(430px,0.95fr)]
        "
      >
        <div
          className="
            h-[380px]
            min-w-0
            p-2.5

            sm:h-[500px]
            sm:p-3

            lg:h-auto
            lg:min-h-[760px]
            lg:p-3.5
          "
        >
          <AuthShowcase />
        </div>

        <section
          className="
            relative
            flex
            min-w-0
            items-center
            justify-center
            bg-[var(--auth-panel)]
            px-5
            py-9
            transition-colors
            duration-300

            sm:px-9
            sm:py-12

            lg:px-12
            lg:py-14

            xl:px-16
          "
        >
          <div
            aria-hidden
            className="
              pointer-events-none
              absolute
              inset-0
              opacity-70
            "
            style={{
              background:
                'radial-gradient(circle at 90% 8%, rgba(0,106,255,0.075), transparent 27%)',
            }}
          />

          <div className="relative z-10 w-full max-w-[470px]">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
