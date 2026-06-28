'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { LOGIN_QUOTES, randomQuote } from '@/lib/authQuotes';
import {
  AuthModernCard,
  AuthModernQuote,
  AuthModernInput,
  AuthModernLabel,
  AuthGradientButton,
  AuthSwitchText,
} from './AuthModern';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();
  const quote = useMemo(() => randomQuote(LOGIN_QUOTES), []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email first');
      return;
    }
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (err) {
      setError(err.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  }

  async function handleOAuth(provider: 'google' | 'github') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (magicLinkSent) {
    return (
      <AuthModernCard title="Check Email">
        <div className="text-center space-y-4 py-6">
          <Zap className="w-10 h-10 mx-auto text-[#006aff]" />
          <p className="text-sm text-slate-600">
            We sent a magic link to <strong className="text-slate-800">{email}</strong>
          </p>
        </div>
      </AuthModernCard>
    );
  }

  return (
    <AuthModernCard title="Sign In">
      <AuthModernQuote text={quote.text} author={quote.author} />

      <div className="my-5">
        <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Or sign in with
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            className="xv-auth-oauth-btn"
            aria-label="Google"
          >
            <span className="text-sm font-bold">G</span>
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            className="xv-auth-oauth-btn"
            aria-label="GitHub"
          >
            <span className="text-xs font-bold">GH</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <AuthModernLabel>Email</AuthModernLabel>
          <AuthModernInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@email.com"
          />
        </div>
        <div>
          <AuthModernLabel>Password</AuthModernLabel>
          <AuthModernInput
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Your password"
          />
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <AuthGradientButton type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </AuthGradientButton>
      </form>

      <div className="mt-4">
        <AuthGradientButton type="button" disabled={loading} onClick={handleMagicLink}>
          Magic Link
        </AuthGradientButton>
      </div>

      <AuthSwitchText prompt="No account?" linkText="Sign up" href="/auth/signup" />
    </AuthModernCard>
  );
}
