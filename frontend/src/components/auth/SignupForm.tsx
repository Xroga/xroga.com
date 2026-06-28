'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthFormCard, GradientStartButton } from '@/components/ui/Uiverse';
import { SIGNUP_QUOTES, randomQuote } from '@/lib/authQuotes';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { generateAvatarUrl } from '@/lib/avatarGenerate';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronRight, Sparkles } from 'lucide-react';

export function SignupForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(XROGA_PROFILE_AVATARS[0]?.url ?? '');
  const [heroPrompt, setHeroPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const quote = useMemo(() => randomQuote(SIGNUP_QUOTES), []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) {
      if (!displayName.trim()) {
        setError('Please enter a display name');
        return;
      }
      setError('');
      setStep(2);
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName, avatar_url: avatarUrl },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signErr) {
      const msg = signErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
        setError('You are already registered with this email. Please sign in instead.');
      } else {
        setError(signErr.message);
      }
      setLoading(false);
      return;
    }

    try {
      await api.profile.update({
        display_name: displayName.trim(),
        avatar_url: avatarUrl || null,
      });
    } catch {
      /* profile may sync on first dashboard load */
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/dashboard'), 1500);
  }

  if (success) {
    return (
      <AuthFormCard title={`Welcome, ${displayName}!`}>
        <p className="text-center text-[var(--accent)] text-sm mt-4">
          Account created! Redirecting to your dashboard…
        </p>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard title={step === 1 ? 'Create Your Profile' : 'Secure Your Account'}>
      <blockquote className="text-center text-xs text-[var(--muted)] italic border-l-2 border-[var(--accent)]/30 pl-3 my-3">
        &ldquo;{quote.text}&rdquo;
        <footer className="text-[10px] mt-1 not-italic opacity-70">— {quote.author}</footer>
      </blockquote>

      <div className="flex justify-center gap-2 mb-4">
        {[1, 2].map((s) => (
          <span
            key={s}
            className={cn(
              'h-1.5 rounded-full transition-all',
              step === s ? 'w-8 bg-[var(--accent)]' : 'w-4 bg-[var(--card-border)]'
            )}
          />
        ))}
      </div>

      <form onSubmit={handleSignup} className="mt-2 space-y-3">
        {step === 1 && (
          <>
            <p className="text-[10px] text-center text-[var(--muted)]">Choose your photo & display name first</p>
            <div className="flex justify-center">
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-[var(--accent)]/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5 max-h-24 overflow-y-auto">
              {XROGA_PROFILE_AVATARS.map((a) => (
                <button
                  key={a.url}
                  type="button"
                  onClick={() => setAvatarUrl(a.url)}
                  className={cn(
                    'aspect-square rounded-lg overflow-hidden border-2 transition-all',
                    avatarUrl === a.url ? 'border-[var(--accent)] scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={heroPrompt}
                onChange={(e) => setHeroPrompt(e.target.value)}
                className="xv-auth-input flex-1 !py-2 text-xs"
                placeholder="Or generate hero avatar…"
              />
              <button
                type="button"
                onClick={() => heroPrompt.trim() && setAvatarUrl(generateAvatarUrl(heroPrompt, 'superhero'))}
                className="px-3 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] text-xs font-bold shrink-0"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
            <input
              id="name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="xv-auth-input"
              placeholder="Display Name"
            />
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-[var(--accent)]/8 border border-[var(--accent)]/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                <button type="button" onClick={() => setStep(1)} className="text-[10px] text-[var(--accent)]">
                  Edit profile
                </button>
              </div>
            </div>
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
          </>
        )}

        {error && (
          <p className="text-red-500 text-sm">
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
          <GradientStartButton type="submit" className="w-full max-w-[240px] text-sm flex items-center justify-center gap-2" disabled={loading}>
            {loading ? 'Creating…' : step === 1 ? (
              <>Continue <ChevronRight className="w-4 h-4" /></>
            ) : (
              'Create Account'
            )}
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
