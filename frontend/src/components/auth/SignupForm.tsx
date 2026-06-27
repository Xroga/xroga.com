'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthFormCard, GradientStartButton } from '@/components/ui/Uiverse';
import { SIGNUP_QUOTES, randomQuote } from '@/lib/authQuotes';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const quote = useMemo(() => randomQuote(SIGNUP_QUOTES), []);

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
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
        setError('You are already registered with this email. Please sign in instead.');
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/dashboard'), 1500);
  }

  if (success) {
    return (
      <AuthFormCard title="Welcome!">
        <p className="text-center text-[var(--accent)] text-sm mt-4">
          Account created! Check your email or redirecting…
        </p>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard title="Sign Up">
      <blockquote className="text-center text-xs text-[var(--muted)] italic border-l-2 border-[var(--accent)]/40 pl-3 my-3">
        &ldquo;{quote.text}&rdquo;
        <footer className="text-[10px] mt-1 not-italic opacity-70">— {quote.author}</footer>
      </blockquote>
      <form onSubmit={handleSignup} className="mt-2">
        <input
          id="name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="xv-auth-input"
          placeholder="Display Name"
        />
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
          minLength={8}
          className="xv-auth-input"
          placeholder="Password (min 8 chars)"
        />

        {error && (
          <p className="text-red-500 text-sm mt-2">
            {error}
            {error.includes('sign in') && (
              <>
                {' '}
                <Link href="/auth/login" className="text-[var(--accent)] underline">
                  Sign in →
                </Link>
              </>
            )}
          </p>
        )}

        <div className="flex justify-center mt-4">
          <GradientStartButton type="submit" className="w-full max-w-[240px] text-sm" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account'}
          </GradientStartButton>
        </div>
      </form>

      <p className="text-center text-sm text-[var(--muted)] mt-4">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthFormCard>
  );
}
