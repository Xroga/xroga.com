'use client';

import type {
  CSSProperties,
} from 'react';

import {
  LoginForm,
} from './LoginForm';

import {
  SignupForm,
} from './SignupForm';

import {
  AuthShowcase,
} from './AuthShowcase';

import {
  useThemeStore,
} from '@/store/useThemeStore';

type AuthMode =
  | 'signup'
  | 'login';

type AuthTheme =
  | 'white'
  | 'beige'
  | 'gray'
  | 'black';

type AuthThemeStyle =
  CSSProperties & {
    '--auth-page': string;

    '--auth-shell': string;

    '--auth-surface': string;

    '--auth-side': string;

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
      '#f2f2ef',

    '--auth-shell':
      '#ffffff',

    '--auth-surface':
      '#ffffff',

    '--auth-side':
      '#fbfbfa',

    '--auth-border':
      'rgba(15,23,42,0.10)',

    '--auth-border-strong':
      'rgba(15,23,42,0.18)',

    '--auth-text':
      '#12151b',

    '--auth-muted':
      '#717782',

    '--auth-input':
      '#f7f7f5',

    '--auth-input-hover':
      '#ffffff',

    '--auth-soft':
      'rgba(15,23,42,0.045)',

    '--auth-shadow':
      '0 30px 90px rgba(24,35,54,0.13), 0 8px 24px rgba(24,35,54,0.05)',
  },

  beige: {
    '--auth-page':
      '#eee8de',

    '--auth-shell':
      '#fbf7ef',

    '--auth-surface':
      '#fbf7ef',

    '--auth-side':
      '#f7f1e7',

    '--auth-border':
      'rgba(86,68,45,0.13)',

    '--auth-border-strong':
      'rgba(86,68,45,0.22)',

    '--auth-text':
      '#29231c',

    '--auth-muted':
      '#786d60',

    '--auth-input':
      '#f3ede2',

    '--auth-input-hover':
      '#fffaf2',

    '--auth-soft':
      'rgba(86,68,45,0.055)',

    '--auth-shadow':
      '0 30px 90px rgba(73,58,40,0.14), 0 8px 24px rgba(73,58,40,0.06)',
  },

  gray: {
    '--auth-page':
      '#111214',

    '--auth-shell':
      '#1a1b1e',

    '--auth-surface':
      '#1a1b1e',

    '--auth-side':
      '#16171a',

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
      '#202125',

    '--auth-soft':
      'rgba(255,255,255,0.05)',

    '--auth-shadow':
      '0 34px 100px rgba(0,0,0,0.44), 0 8px 26px rgba(0,0,0,0.25)',
  },

  black: {
    '--auth-page':
      '#000000',

    '--auth-shell':
      '#090a0c',

    '--auth-surface':
      '#090a0c',

    '--auth-side':
      '#060709',

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
      '0 36px 110px rgba(0,0,0,0.70), 0 10px 30px rgba(0,0,0,0.42)',
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
  mode,
}: {
  mode: AuthMode;
}) {
  const currentTheme =
    useThemeStore(
      (state) =>
        state.theme
    );

  const theme =
    resolveTheme(
      currentTheme
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
        flex
        min-h-[100dvh]

        items-center
        justify-center

        bg-[var(--auth-page)]

        p-2

        text-[var(--auth-text)]

        transition-colors
        duration-300

        sm:p-3

        xl:h-[100dvh]
        xl:overflow-hidden
      "
    >
      {/*
       * ONE SINGLE AUTH CARD.
       *
       * Desktop:
       *
       * IMAGE | CREATE ACCOUNT | SIGN IN
       *
       * Tablet/mobile:
       *
       * IMAGE
       * ACTIVE FORM
       */}
      <div
        className="
          mx-auto
          grid
          w-full
          max-w-[1740px]

          overflow-hidden

          rounded-[30px]

          border
          border-[var(--auth-border)]

          bg-[var(--auth-shell)]

          shadow-[var(--auth-shadow)]

          grid-cols-1

          xl:h-[calc(100dvh-24px)]
          xl:max-h-[760px]
          xl:min-h-[680px]

          xl:grid-cols-[minmax(450px,1.12fr)_minmax(500px,0.98fr)_minmax(300px,0.66fr)]
        "
      >
        {/*
         * IMAGE
         *
         * No padding.
         * No second card.
         * No fake image background.
         */}
        <div
          className="
            relative
            min-h-0
            min-w-0
            overflow-hidden

            h-[300px]

            sm:h-[370px]

            lg:h-[430px]

            xl:h-full
          "
        >
          <AuthShowcase />
        </div>

        {/*
         * CREATE ACCOUNT
         *
         * Always shown on desktop.
         * Below desktop it is shown only
         * when the current route is signup.
         */}
        <section
          className={[
            `
              min-h-0
              min-w-0

              items-center
              justify-center

              bg-[var(--auth-surface)]

              px-5
              py-7

              sm:px-8

              xl:flex
              xl:h-full
              xl:overflow-y-auto
              xl:border-l
              xl:border-[var(--auth-border)]
              xl:px-8
              xl:py-6

              [scrollbar-width:none]
              [&::-webkit-scrollbar]:hidden
            `,

            mode === 'signup'
              ? 'flex'
              : 'hidden xl:flex',
          ].join(' ')}
        >
          <div
            className="
              w-full
              max-w-[560px]
            "
          >
            <SignupForm />
          </div>
        </section>

        {/*
         * SIGN IN
         *
         * Always shown on desktop.
         * Below desktop it is shown only
         * when the current route is login.
         */}
        <aside
          className={[
            `
              min-h-0
              min-w-0

              items-center
              justify-center

              bg-[var(--auth-side)]

              px-5
              py-8

              sm:px-8

              xl:flex
              xl:h-full
              xl:border-l
              xl:border-[var(--auth-border)]
              xl:px-6
              xl:py-7
            `,

            mode === 'login'
              ? 'flex'
              : 'hidden xl:flex',
          ].join(' ')}
        >
          <div
            className="
              w-full
              max-w-[390px]
            "
          >
            <LoginForm />
          </div>
        </aside>
      </div>
    </main>
  );
}
