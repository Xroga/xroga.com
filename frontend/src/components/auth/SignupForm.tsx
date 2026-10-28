'use client';

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
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

import { GitHubIcon } from './AuthGitHubIcon';
import { GoogleIcon } from './AuthGoogleIcon';
import { normalizeContactPhone } from '@/lib/contactPhone';

import { createClient } from '@/lib/supabase/client';

import {
  safeAuthError,
  withAuthTimeout,
} from '@/lib/supabase/authErrors';

import { requireOAuthProvider } from '@/lib/supabase/authProviders';
import { rememberOAuthNextPath, safeAuthNextPath } from '@/lib/supabase/oauthReturn';

import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';

import { api } from '@/lib/api';

import { isTemporaryEmail } from '@/lib/emailValidation';

import { getPasswordStrength } from '@/lib/passwordStrength';


import { useThemeStore } from '@/store/useThemeStore';

import {
  normalizeTheme,
} from '@/lib/theme';

import {
  clearStoredReferralCode,
  getStoredReferralCode,
  storeReferralCode,
} from '@/lib/referralStorage';

import {
  AuthDivider,
  AuthModernCard,
  AuthModernInput,
  AuthModernLabel,
  AuthSocialButton,
  AuthSwitchText,
} from './AuthModern';

import styles from './SignupForm.module.css';

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
  const nextPath = safeAuthNextPath(requestedNext, '/onboarding');

  const globalTheme =
    useThemeStore(
      (state) =>
        state.theme
    );

  const theme = normalizeTheme(globalTheme);

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

  const [phone, setPhone] = useState('');

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    displayName,
    setDisplayName,
  ] = useState('');

  const avatarUrl = XROGA_PROFILE_AVATARS[0]?.url ?? '';

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

  async function handleOAuth(provider: 'github' | 'google') {
    setError('');

    setOauthLoading(
      true
    );

    try {
      await requireOAuthProvider(provider);
      rememberOAuthNextPath(nextPath);

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
              provider,

              options: {
                redirectTo:
                  `${window.location.origin}` +
                  '/auth/callback',

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
          `${provider === 'google' ? 'Google' : 'GitHub'} sign-in is currently unavailable.`
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

    const contactPhone = normalizeContactPhone(phone);
    if (!contactPhone) {
      setError('Enter a contact number with country code, for example +1 412 555 0123.');
      return;
    }

    setLoading(
      true
    );

    setError('');

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
                contact_phone: contactPhone,
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
      <div className={styles.signupCard}>
        <AuthModernCard
          eyebrow={
            <span className={styles.kicker}>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Account ready
            </span>
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
              border border-emerald-400/20
              bg-emerald-400/8
              px-5 py-5 text-center
            "
          >
            <p className="text-[13px] font-semibold leading-relaxed text-[var(--auth-text)]">
              {confirmationRequired
                ? 'Check your email to confirm your account, then sign in.'
                : 'Account created. Taking you to your workspace…'}
            </p>
          </div>
        </AuthModernCard>
      </div>
    );
  }

  return (
    <div className={styles.signupCard}>
      <AuthModernCard
        eyebrow={
          <span className={styles.kicker}>
            <span className={styles.kickerMarker} aria-hidden="true" />
            Join to access all world possibility of work
          </span>
        }
        title="Create your account"
        subtitle="One account for everything you build with Xroga."
      >

      <AuthSocialButton
        onClick={() => void handleOAuth('google')}
        disabled={oauthLoading || loading}
        provider="google"
        className={`${styles.githubButton} mb-3`}
      >
        <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
        {oauthLoading ? 'Connecting…' : 'Continue with Google'}
      </AuthSocialButton>

      <AuthSocialButton
        onClick={() => void handleOAuth('github')}
        disabled={
          oauthLoading ||
          loading
        }
        className={styles.githubButton}
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


      </AuthSocialButton>

      <AuthDivider />

      <form
        onSubmit={
          handleSignup
        }
        className={styles.form}
      >


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
          <AuthModernLabel htmlFor="signup-phone">Contact phone number</AuthModernLabel>
          <AuthModernInput
            id="signup-phone"
            type="tel"
            icon={<Phone className="h-4 w-4" />}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            autoComplete="tel"
            placeholder="+1 412 555 0123"
          />
          <p className="mt-1.5 text-[11px] text-[var(--auth-muted)]">
            Required for account contact. No SMS verification; this number is not used to sign in.
          </p>
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


        <button
          type="submit"
          className={styles.galaxyButton}
          disabled={
            loading ||
            oauthLoading
          }
        >
          <span className={styles.galaxyContent}>
            <span>{loading ? 'Creating account…' : 'Create account'}</span>
            {!loading ? <ArrowRight className={styles.galaxyIcon} aria-hidden="true" /> : null}
          </span>
        </button>
      </form>

      <AuthSwitchText
        prompt="Already have an account?"
        linkText="Sign in"
        href={`/auth/login?next=${encodeURIComponent(
          nextPath
        )}`}
      />
      </AuthModernCard>
    </div>
  );
}
