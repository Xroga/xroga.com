'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap } from 'lucide-react';

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
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-violet-600/20 flex items-center justify-center">
          <Zap className="w-6 h-6 text-violet-400" />
        </div>
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="text-[var(--muted)] text-sm">
          We sent a magic link to <strong>{email}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          className="flex-1 py-2.5 px-4 rounded-lg border border-[var(--card-border)] bg-white/5 hover:bg-white/10 text-sm transition-colors"
        >
          Google
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('github')}
          className="flex-1 py-2.5 px-4 rounded-lg border border-[var(--card-border)] bg-white/5 hover:bg-white/10 text-sm transition-colors"
        >
          GitHub
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--card-border)]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-[var(--card)] px-2 text-[var(--muted)]">or continue with email</span>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-[var(--muted)] mb-1.5">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-[var(--muted)] mb-1.5">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 font-medium text-sm transition-all disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleMagicLink}
        disabled={loading}
        className="w-full py-2.5 rounded-lg border border-[var(--card-border)] hover:bg-white/5 text-sm transition-colors disabled:opacity-50"
      >
        Send Magic Link
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        No account?{' '}
        <Link href="/auth/signup" className="text-violet-400 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
