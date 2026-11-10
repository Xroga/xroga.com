'use client';

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from 'lucide-react';

import {
  type FormEvent,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import { GitHubIcon } from './AuthGitHubIcon';
import { GoogleIcon } from './AuthGoogleIcon';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';

import {
  safeAuthError,
  withAuthTimeout,
} from '@/lib/supabase/authErrors';

import { requireOAuthProvider } from '@/lib/supabase/authProviders';
import { passwordRecoveryEnabled } from '@/lib/supabase/authRecovery';
import { rememberOAuthNextPath, safeAuthNextPath } from '@/lib/supabase/oauthReturn';

import {
  AuthDivider,
  AuthGradientButton,
  AuthModernCard,
  AuthModernInput,
  AuthModernLabel,
  AuthSocialButton,
  AuthSwitchText,
} from './AuthModern';

export function LoginForm() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const requestedNext =
    searchParams.get(
      'next'
    );

  const nextPath = safeAuthNextPath(requestedNext, '/workspace');

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
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    oauthLoading,
    setOauthLoading,
  ] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const supabase =
        createClient();

      const {
        error:
          signInError,
      } =
        await supabase.auth.signInWithPassword(
          {
            email,
            password,
          }
        );

      if (
        signInError
      ) {
        setError(
          safeAuthError(
            signInError,
            'Sign in failed. Please try again.'
          )
        );

        return;
      }

      router.push(
        nextPath
      );

      router.refresh();
    } catch (err) {
      setError(
        safeAuthError(
          err,
          'Sign in failed. Please try again.'
        )
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  const [magicSent, setMagicSent] = useState(false);

  async function handleMagicLink() {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address first, then request a sign-in link.');
      return;
    }
    setLoading(true);
    try {
      const { error: otpError } = await createClient().auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (otpError && (otpError.status === 429 || /rate limit/i.test(otpError.message))) {
        setError('Please wait a moment before requesting another sign-in link.');
      } else if (otpError && ((otpError.status ?? 0) >= 500 || /smtp|send|mailer/i.test(otpError.message))) {
        setError('The email service is unavailable right now. Please try again later.');
      } else if (otpError && !/signups? not allowed|user not found/i.test(otpError.message)) {
        setError(safeAuthError(otpError, 'The sign-in link could not be sent. Please try again.'));
      } else {
        // Same message whether or not the address has an account.
        setMagicSent(true);
      }
    } catch (err) {
      setError(safeAuthError(err, 'The sign-in link could not be sent. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'github' | 'google') {
    setError(null);

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

  return (
    <AuthModernCard
      compact
      title="Sign in to Xroga"
      subtitle="Continue creating, building and shipping from your workspace."
    >
      <AuthSocialButton
        onClick={() => void handleOAuth('google')}
        disabled={oauthLoading || loading}
        provider="google"
        className="mb-3"
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
          handleSubmit
        }
        className="
          space-y-3.5
        "
      >
        <div>
          <AuthModernLabel
            htmlFor="login-email"
          >
            Email address
          </AuthModernLabel>

          <AuthModernInput
            id="login-email"
            type="email"
            icon={
              <Mail
                className="
                  h-4
                  w-4
                "
              />
            }
            placeholder="you@example.com"
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
          />
        </div>

        {passwordRecoveryEnabled && <div className="text-right">
          <Link className="text-xs font-semibold text-[#006aff] hover:underline" href="/auth/forgot-password">
            Forgot password?
          </Link>
        </div>}

        <div>
          <AuthModernLabel
            htmlFor="login-password"
          >
            Password
          </AuthModernLabel>

          <AuthModernInput
            id="login-password"
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
            placeholder="Enter your password"
            value={password}
            onChange={(
              event
            ) =>
              setPassword(
                event.target.value
              )
            }
            required
            autoComplete="current-password"
          />
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
            ? 'Signing in…'
            : 'Sign in'}

        </AuthGradientButton>

        {magicSent ? (
          <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-[11px] leading-relaxed text-[var(--auth-text)]">
            If this email belongs to an account, a sign-in link is on its way. Check your inbox and spam folder.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading || oauthLoading}
            className="w-full text-center text-xs font-semibold text-[#006aff] hover:underline disabled:opacity-50"
          >
            Email me a sign-in link instead
          </button>
        )}
      </form>

      <AuthSwitchText
        prompt="New to Xroga?"
        linkText="Create an account"
        href={`/auth/signup?next=${encodeURIComponent(
          nextPath
        )}`}
      />
    </AuthModernCard>
  );
}
