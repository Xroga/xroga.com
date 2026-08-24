'use client';

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from 'lucide-react';

import {
  type FormEvent,
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import { GitHubIcon } from '@/components/icons/GitHubIcon';

import { createClient } from '@/lib/supabase/client';

import {
  safeAuthError,
  withAuthTimeout,
} from '@/lib/supabase/authErrors';

import { requireGitHubProvider } from '@/lib/supabase/authProviders';

import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';

import { api } from '@/lib/api';

import { isTemporaryEmail } from '@/lib/emailValidation';

import { getPasswordStrength } from '@/lib/passwordStrength';

import { cn } from '@/lib/utils';

import { useThemeStore } from '@/store/useThemeStore';

import {
  normalizeTheme,
  THEME_OPTIONS,
  type CoreThemeId,
} from '@/lib/theme';

import {
  clearStoredReferralCode,
  getStoredReferralCode,
  storeReferralCode,
} from '@/lib/referralStorage';

import {
  AuthDivider,
  AuthGradientButton,
  AuthModernCard,
  AuthModernInput,
  AuthModernLabel,
  AuthSocialButton,
  AuthSwitchText,
} from './AuthModern';

const THEME_SWATCHES: Record<
  CoreThemeId,
  {
    background: string;
    foreground: string;
  }
> = {
  white: {
    background:
      '#ffffff',
    foreground:
      '#111111',
  },

  beige: {
    background:
      '#f5efe3',
    foreground:
      '#3a3127',
  },

  gray: {
    background:
      '#2a2a2a',
    foreground:
      '#f5f5f5',
  },

  black: {
    background:
      '#000000',
    foreground:
      '#ffffff',
  },
};

function getStrengthLabel(
  score: number
) {
  if (score <= 1) {
    return 'Weak';
  }

  if (score === 2) {
    return 'Good';
  }

  if (score === 3) {
    return 'Strong';
  }

  return 'Excellent';
}

export function SignupForm() {
  const searchParams =
    useSearchParams();

  const router =
    useRouter();

  const refFromUrl =
    searchParams.get(
      'ref'
    );

  const requestedNext =
    searchParams.get(
      'next'
    );

  /*
   * A brand-new account goes to setup rather than straight into the workspace.
   *
   * Only as the default. An explicit `next` — a shared link, a paywalled page that
   * bounced them here — still wins, and onboarding is not lost by honouring it: the
   * shell sends an unfinished account back to `/onboarding` on its next load.
   */
  const nextPath =
    requestedNext?.startsWith('/') &&
    !requestedNext.startsWith('//')
      ? requestedNext
      : '/onboarding';

  const globalTheme =
    useThemeStore(
      (state) =>
        state.theme
    );

  const setGlobalTheme =
    useThemeStore(
      (state) =>
        state.setTheme
    );

  const [
    theme,
    setTheme,
  ] =
    useState<CoreThemeId>(
      () =>
        normalizeTheme(
          globalTheme
        )
    );

  const [
    referralCode,
    setReferralCode,
  ] = useState('');

  const [
    email,
    setEmail,
  ] = useState('');

  const [
    password,
    setPassword,
  ] = useState('');

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    displayName,
    setDisplayName,
  ] = useState('');

  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState(
    XROGA_PROFILE_AVATARS[
      0
    ]?.url ?? ''
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    oauthLoading,
    setOauthLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    confirmationRequired,
    setConfirmationRequired,
  ] = useState(false);

  const passwordStrength =
    getPasswordStrength(
      password
    );

  const strengthLabel =
    getStrengthLabel(
      passwordStrength.score
    );

  useEffect(() => {
    setTheme(
      normalizeTheme(
        globalTheme
      )
    );
  }, [
    globalTheme,
  ]);

  useEffect(() => {
    const code =
      refFromUrl ??
      getStoredReferralCode();

    if (code) {
      setReferralCode(
        code.toUpperCase()
      );

      storeReferralCode(
        code
      );
    }
  }, [
    refFromUrl,
  ]);

  function selectTheme(
    nextTheme: CoreThemeId
  ) {
    setTheme(
      nextTheme
    );

    setGlobalTheme(
      nextTheme
    );
  }

  async function handleGitHub() {
    setError('');

    setOauthLoading(
      true
    );

    try {
      await requireGitHubProvider();

      const supabase =
        createClient();

      const {
        data,
        error:
          oauthError,
      } =
        await withAuthTimeout(
          supabase.auth.signInWithOAuth(
            {
              provider:
                'github',

              options: {
                redirectTo:
                  `${window.location.origin}` +
                  `/auth/callback?next=${encodeURIComponent(
                    nextPath
                  )}`,

                skipBrowserRedirect:
                  true,
              },
            }
          )
        );

      if (
        oauthError
      ) {
        throw oauthError;
      }

      if (
        !data.url
      ) {
        throw new Error(
          'OAuth provider did not return a redirect URL'
        );
      }

      window.location.assign(
        data.url
      );
    } catch (err) {
      setOauthLoading(
        false
      );

      setError(
        safeAuthError(
          err,
          'GitHub sign-in is currently unavailable.'
        )
      );
    }
  }

  async function handleSignup(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !displayName.trim()
    ) {
      setError(
        'Please enter a display name'
      );

      return;
    }

    if (
      isTemporaryEmail(
        email
      )
    ) {
      setError(
        'Temporary email addresses are not allowed. Use a real email.'
      );

      return;
    }

    if (
      passwordStrength.score <
      2
    ) {
      setError(
        'Please choose a stronger password'
      );

      return;
    }

    setLoading(
      true
    );

    setError('');

    setGlobalTheme(
      theme
    );

    try {
      const supabase =
        createClient();

      const {
        data,
        error:
          signupError,
      } =
        await supabase.auth.signUp(
          {
            email,
            password,

            options: {
              data: {
                full_name:
                  displayName.trim(),

                avatar_url:
                  avatarUrl,

                preferred_theme:
                  theme,
              },

              emailRedirectTo:
                `${window.location.origin}` +
                `/auth/callback?next=${encodeURIComponent(
                  nextPath
                )}`,
            },
          }
        );

      if (
        signupError
      ) {
        const message =
          signupError.message.toLowerCase();

        if (
          message.includes(
            'already registered'
          ) ||
          message.includes(
            'already exists'
          ) ||
          message.includes(
            'user already'
          )
        ) {
          setError(
            'You are already registered with this email. Please sign in instead.'
          );
        } else {
          setError(
            safeAuthError(
              signupError,
              'Account creation failed. Please try again.'
            )
          );
        }

        return;
      }

      if (
        !data.session
      ) {
        setConfirmationRequired(
          true
        );

        setSuccess(
          true
        );

        return;
      }

      try {
        await api.profile.update(
          {
            display_name:
              displayName.trim(),

            avatar_url:
              avatarUrl ||
              null,
          }
        );
      } catch {
        /*
         * Profile can synchronise
         * during first workspace load.
         */
      }

      const code =
        referralCode.trim() ||
        getStoredReferralCode();

      if (code) {
        try {
          const result =
            await api.referrals.apply(
              code
            );

          if (
            result.success
          ) {
            clearStoredReferralCode();
          }
        } catch {
          /*
           * Referral can be applied later
           * if the session is not ready.
           */
        }
      }

      setSuccess(
        true
      );

      window.setTimeout(
        () => {
          router.push(
            nextPath
          );
        },
        1500
      );
    } catch (err) {
      setError(
        safeAuthError(
          err,
          'Account creation failed. Please try again.'
        )
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  if (success) {
    return (
      <AuthModernCard
        eyebrow={
          <>
            <Sparkles
              className="
                h-3.5
                w-3.5
                text-[#006aff]
              "
            />

            Account ready
          </>
        }
        title={`Welcome, ${displayName}!`}
        subtitle={
          confirmationRequired
            ? 'One final step before your workspace is ready.'
            : 'Your Xroga workspace is ready.'
        }
      >
        <div
          className="
            rounded-[18px]

            border
            border-[#006aff]/20

            bg-[#006aff]/8

            px-5
            py-5

            text-center
          "
        >
          <p
            className="
              text-[13px]
              font-semibold
              leading-relaxed

              text-[var(--auth-text)]
            "
          >
            {confirmationRequired
              ? 'Check your email to confirm your account, then sign in.'
              : 'Account created. Taking you to your workspace…'}
          </p>
        </div>
      </AuthModernCard>
    );
  }

  return (
    <AuthModernCard
      eyebrow={
        <>
          <Sparkles
            className="
              h-3.5
              w-3.5
              text-[#006aff]
            "
          />

          Join the next generation workspace
        </>
      }
      title="Create your account"
      subtitle="Start building with Xroga and personalise your workspace before you begin."
    >
      <AuthSocialButton
        onClick={
          handleGitHub
        }
        disabled={
          oauthLoading ||
          loading
        }
      >
        <GitHubIcon
          className="
            h-[18px]
            w-[18px]
            shrink-0
          "
        />

        {oauthLoading
          ? 'Connecting…'
          : 'Continue with GitHub'}

        <ArrowRight
          className="
            ml-auto
            h-3.5
            w-3.5

            text-[var(--auth-muted)]
          "
        />
      </AuthSocialButton>

      <AuthDivider />

      <form
        onSubmit={
          handleSignup
        }
        className="
          space-y-3
        "
      >
        {/*
         * Workspace theme
         */}
        <div>
          <AuthModernLabel>
            Workspace theme
          </AuthModernLabel>

          <div
            className="
              grid
              grid-cols-4
              gap-2
            "
          >
            {THEME_OPTIONS.map(
              (option) => {
                const selected =
                  theme ===
                  option.id;

                const swatch =
                  THEME_SWATCHES[
                    option.id
                  ];

                return (
                  <button
                    key={
                      option.id
                    }
                    type="button"
                    onClick={() =>
                      selectTheme(
                        option.id
                      )
                    }
                    aria-pressed={
                      selected
                    }
                    className={cn(
                      'relative',

                      'flex',
                      'h-[58px]',
                      'min-w-0',

                      'flex-col',

                      'justify-between',

                      'rounded-[13px]',

                      'border',

                      'px-3',
                      'py-2',

                      'text-left',

                      'transition-all',
                      'duration-200',

                      selected
                        ? [
                            'border-[#006aff]',
                            'bg-[#006aff]/10',
                            'shadow-[0_6px_18px_rgba(0,106,255,0.10)]',
                            'ring-1',
                            'ring-[#006aff]/15',
                          ].join(
                            ' '
                          )
                        : [
                            'border-[var(--auth-border)]',
                            'bg-[var(--auth-input)]',
                            'hover:border-[var(--auth-border-strong)]',
                            'hover:bg-[var(--auth-input-hover)]',
                          ].join(
                            ' '
                          )
                    )}
                  >
                    <span
                      className="
                        h-[17px]
                        w-[17px]

                        rounded-full

                        border
                        border-black/10

                        shadow-sm
                      "
                      style={{
                        background:
                          swatch.background,

                        color:
                          swatch.foreground,
                      }}
                    />

                    <span
                      className="
                        truncate

                        text-[10px]
                        font-semibold

                        text-[var(--auth-text)]
                      "
                    >
                      {option.label}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/*
         * Profile avatars
         */}
        <div>
          <AuthModernLabel>
            Profile
          </AuthModernLabel>

          <div
            className="
              flex
              items-center
              gap-2
            "
          >
            {XROGA_PROFILE_AVATARS
              .slice(
                0,
                6
              )
              .map(
                (
                  avatar
                ) => {
                  const selected =
                    avatarUrl ===
                    avatar.url;

                  return (
                    <button
                      key={
                        avatar.url
                      }
                      type="button"
                      onClick={() =>
                        setAvatarUrl(
                          avatar.url
                        )
                      }
                      aria-label="Select profile avatar"
                      aria-pressed={
                        selected
                      }
                      className={cn(
                        'relative',

                        'h-[45px]',
                        'w-[45px]',

                        'shrink-0',

                        'overflow-hidden',

                        'rounded-[12px]',

                        'border-2',

                        'bg-[var(--auth-input)]',

                        'transition-all',
                        'duration-200',

                        selected
                          ? [
                              'border-[#006aff]',
                              'scale-[1.03]',
                              'shadow-[0_6px_18px_rgba(0,106,255,0.18)]',
                            ].join(
                              ' '
                            )
                          : [
                              'border-transparent',
                              'opacity-75',
                              'hover:opacity-100',
                            ].join(
                              ' '
                            )
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          avatar.url
                        }
                        alt=""
                        className="
                          h-full
                          w-full
                          object-cover
                        "
                      />
                    </button>
                  );
                }
              )}
          </div>
        </div>

        {/*
         * Name and email side-by-side
         * on tablets/desktop.
         */}
        <div
          className="
            grid
            grid-cols-1
            gap-3

            sm:grid-cols-2
          "
        >
          <div>
            <AuthModernLabel
              htmlFor="signup-name"
            >
              Display name
            </AuthModernLabel>

            <AuthModernInput
              id="signup-name"
              type="text"
              icon={
                <UserRound
                  className="
                    h-4
                    w-4
                  "
                />
              }
              value={
                displayName
              }
              onChange={(
                event
              ) =>
                setDisplayName(
                  event.target.value
                )
              }
              required
              autoComplete="name"
              placeholder="How should we call you?"
            />
          </div>

          <div>
            <AuthModernLabel
              htmlFor="signup-email"
            >
              Email address
            </AuthModernLabel>

            <AuthModernInput
              id="signup-email"
              type="email"
              icon={
                <Mail
                  className="
                    h-4
                    w-4
                  "
                />
              }
              value={email}
              onChange={(
                event
              ) =>
                setEmail(
                  event.target.value
                )
              }
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <div
            className="
              flex
              items-center
              justify-between
            "
          >
            <AuthModernLabel
              htmlFor="signup-password"
            >
              Password
            </AuthModernLabel>

            {password ? (
              <span
                className="
                  mb-1.5
                  text-[9px]
                  font-semibold

                  text-[var(--auth-muted)]
                "
              >
                {strengthLabel}
              </span>
            ) : null}
          </div>

          <AuthModernInput
            id="signup-password"
            type={
              showPassword
                ? 'text'
                : 'password'
            }
            icon={
              <LockKeyhole
                className="
                  h-4
                  w-4
                "
              />
            }
            endAdornment={
              <button
                type="button"
                aria-label={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
                onClick={() =>
                  setShowPassword(
                    (value) =>
                      !value
                  )
                }
                className="
                  grid
                  h-7
                  w-7

                  place-items-center

                  rounded-lg

                  text-[var(--auth-muted)]

                  transition-colors

                  hover:bg-[var(--auth-soft)]
                  hover:text-[var(--auth-text)]
                "
              >
                {showPassword ? (
                  <EyeOff
                    className="
                      h-4
                      w-4
                    "
                  />
                ) : (
                  <Eye
                    className="
                      h-4
                      w-4
                    "
                  />
                )}
              </button>
            }
            value={password}
            onChange={(
              event
            ) =>
              setPassword(
                event.target.value
              )
            }
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
          />

          {password ? (
            <div
              className="
                mt-2

                h-1.5

                overflow-hidden

                rounded-full

                bg-[var(--auth-soft)]
              "
            >
              <div
                className="
                  h-full

                  rounded-full

                  transition-all
                  duration-300
                "
                style={{
                  width:
                    `${passwordStrength.percent}%`,

                  backgroundColor:
                    passwordStrength.color,
                }}
              />
            </div>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="
              rounded-xl

              border
              border-red-500/20

              bg-red-500/10

              px-3.5
              py-2.5

              text-[11px]
              leading-relaxed

              text-red-500
            "
          >
            {error}

            {error.includes(
              'sign in'
            ) ? (
              <>
                {' '}

                <Link
                  href="/auth/login"
                  className="
                    font-semibold

                    text-[#006aff]

                    underline
                  "
                >
                  Sign in →
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        <AuthGradientButton
          type="submit"
          disabled={
            loading ||
            oauthLoading
          }
        >
          {loading
            ? 'Creating account…'
            : 'Create account'}

          {!loading ? (
            <Sparkles
              className="
                h-4
                w-4
              "
            />
          ) : null}
        </AuthGradientButton>
      </form>

      <AuthSwitchText
        prompt="Already have an account?"
        linkText="Sign in"
        href={`/auth/login?next=${encodeURIComponent(
          nextPath
        )}`}
      />
    </AuthModernCard>
  );
}
