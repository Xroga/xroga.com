'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { AuthFormCard, PlayNowButton } from '@/components/ui/Uiverse';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
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
      <AuthFormCard title="Check Email">
        <div className="text-center space-y-4 mt-4">
          <Zap className="w-8 h-8 mx-auto text-cyan-500" />
          <p className="text-sm text-gray-600">
            We sent a magic link to <strong>{email}</strong>
          </p>
        </div>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard title="Sign In">
      <div className="social-account-container mt-4">
        <span className="title block text-center text-[10px] text-gray-400 mb-2">Or Sign in with</span>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-gray-500 border-4 border-white shadow-lg flex items-center justify-center"
            aria-label="Google"
          >
            <span className="text-white text-xs font-bold">G</span>
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-gray-500 border-4 border-white shadow-lg flex items-center justify-center"
            aria-label="GitHub"
          >
            <span className="text-white text-xs font-bold">GH</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleLogin} className="mt-4">
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="xv-auth-input"
          placeholder="E-mail"
        />
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="xv-auth-input"
          placeholder="Password"
        />

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <button type="submit" disabled={loading} className="xv-auth-submit">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="flex justify-center mt-4">
        <PlayNowButton onClick={handleMagicLink} disabled={loading}>
          Magic Link
        </PlayNowButton>
      </div>

      <p className="text-center text-sm text-gray-500 mt-4">
        No account?{' '}
        <Link href="/auth/signup" className="text-cyan-600 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthFormCard>
  );
}
