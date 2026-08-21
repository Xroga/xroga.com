'use client';

import { useState } from 'react';
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedNext = searchParams.get('next');

  const nextPath =
    requestedNext?.startsWith('/') &&
    !requestedNext.startsWith('//')
      ? requestedNext
      : '/workspace';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [oauthLoading, setOauthLoading] =
    useState(false);

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError) {
        setError(
          safeAuthError(
            signInError,
            'Sign in failed. Please try again.'
          )
        );

        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(
        safeAuthError(
          err,
          'Sign in failed. Please try again.'
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGitHub() {
    setError(null);
    setOauthLoading(true);

    try {
      await requireGitHubProvider();

      const supabase = createClient();

      const { data, error: oauthError } =
        await withAuthTimeout(
          supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
              redirectTo:
                `${window.location.origin}` +
                `/auth/callback?next=${encodeURIComponent(
                  nextPath
                )}`,
              skipBrowserRedirect: true,
            },
          })
        );

      if (oauthError) {
        throw oauthError;
      }

      if (!data.url) {
        throw new Error(
          'OAuth provider did not return a redirect URL'
        );
      }

      window.location.assign(data.url);
    } catch (err) {
      setOauthLoading(false);

      setError(
        safeAuthError(
          err,
          'GitHub sign-in is currently unavailable.'
        )
      );
    }
  }

  return (
    <AuthModernCard
      title="Welcome back"
      subtitle="Sign in and continue building with Xroga."
    >
      <AuthSocialButton
        onClick={handleGitHub}
        disabled={oauthLoading || loading}
      >
        <GitHubIcon className="h-5 w-5 shrink-0" />

        {oauthLoading
          ? 'Connecting…'
          : 'Continue with GitHub'}
      </AuthSocialButton>

      <AuthDivider />

      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div>
          <AuthModernLabel htmlFor="login-email">
            Email address
          </AuthModernLabel>

          <AuthModernInput
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
            autoComplete="email"
          />
        </div>

        <div>
          <AuthModernLabel htmlFor="login-password">
            Password
          </AuthModernLabel>

          <AuthModernInput
            id="login-password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
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
              bg-red-500/8
              px-3.5
              py-3
              text-center
              text-sm
              text-red-500
            "
          >
            {error}
          </div>
        ) : null}

        <AuthGradientButton
          type="submit"
          disabled={loading || oauthLoading}
        >
          {loading
            ? 'Signing in…'
            : 'Sign in'}
        </AuthGradientButton>
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
