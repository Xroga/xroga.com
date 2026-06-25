'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // If email confirmation is disabled, redirect immediately
    setTimeout(() => router.push('/dashboard'), 1500);
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-emerald-400">Account created!</h2>
        <p className="text-[var(--muted)] text-sm">
          Check your email to verify, or you&apos;ll be redirected shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm text-[var(--muted)] mb-1.5">Display Name</label>
        <input
          id="name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
          placeholder="Your name"
        />
      </div>
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
          minLength={8}
          className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
          placeholder="Min 8 characters"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 font-medium text-sm transition-all disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-violet-400 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
