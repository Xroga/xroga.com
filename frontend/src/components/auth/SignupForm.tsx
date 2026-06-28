'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SIGNUP_QUOTES, randomQuote } from '@/lib/authQuotes';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { generateAvatarUrl } from '@/lib/avatarGenerate';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronRight, Sparkles, Wand2 } from 'lucide-react';
import {
  AuthModernCard,
  AuthModernQuote,
  AuthModernInput,
  AuthModernLabel,
  AuthStepDots,
  AuthGradientButton,
  AuthSwitchText,
} from './AuthModern';

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
      <AuthModernCard title={`Welcome, ${displayName}!`}>
        <p className="text-center xv-auth-gradient-text text-sm font-semibold mt-4 py-6">
          Account created! Redirecting to your dashboard…
        </p>
      </AuthModernCard>
    );
  }

  return (
    <AuthModernCard
      title={step === 1 ? 'Create Your Profile' : 'Secure Your Account'}
      subtitle={step === 1 ? '50 free Actions on signup — choose your identity first' : undefined}
    >
      <AuthModernQuote text={quote.text} author={quote.author} />
      <AuthStepDots step={step} />

      <form onSubmit={handleSignup} className="space-y-4">
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-center text-xs text-slate-500 font-medium">
              Choose your photo & display name first
            </p>

            <div className="flex justify-center py-2">
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden ring-4 ring-[#006aff]/25 shadow-lg shadow-blue-500/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              </div>
            </div>

            <div>
              <AuthModernLabel>Pick a photo</AuthModernLabel>
              <div className="grid grid-cols-5 gap-2 p-3 rounded-2xl bg-slate-50/80 border border-sky-100 max-h-28 overflow-y-auto">
                {XROGA_PROFILE_AVATARS.map((a) => (
                  <button
                    key={a.url}
                    type="button"
                    onClick={() => setAvatarUrl(a.url)}
                    className={cn(
                      'aspect-square rounded-xl overflow-hidden border-2 transition-all',
                      avatarUrl === a.url
                        ? 'border-[#006aff] ring-2 ring-[#006aff]/30 scale-105'
                        : 'border-transparent opacity-75 hover:opacity-100 hover:border-sky-200'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <AuthModernLabel>
                <span className="inline-flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Generate hero avatar
                </span>
              </AuthModernLabel>
              <div className="flex gap-2">
                <AuthModernInput
                  value={heroPrompt}
                  onChange={(e) => setHeroPrompt(e.target.value)}
                  placeholder="Describe your hero look…"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => heroPrompt.trim() && setAvatarUrl(generateAvatarUrl(heroPrompt, 'superhero'))}
                  className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-[#006aff] to-[#60a5fa] text-white flex items-center justify-center shadow-lg shadow-blue-500/25 hover:scale-105 transition-transform"
                  title="Generate"
                >
                  <Sparkles className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <AuthModernLabel>Display name</AuthModernLabel>
              <AuthModernInput
                id="name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="How should we call you?"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" className="w-12 h-12 rounded-xl object-cover ring-2 ring-white shadow" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs xv-auth-gradient-text font-semibold"
                >
                  Edit profile
                </button>
              </div>
            </div>
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
                minLength={8}
                placeholder="Min. 8 characters"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm text-center px-2">
            {error}
            {error.includes('sign in') && (
              <>
                {' '}
                <Link href="/auth/login" className="xv-auth-gradient-text font-semibold underline">
                  Sign in →
                </Link>
              </>
            )}
          </p>
        )}

        <div className="pt-2">
          <AuthGradientButton type="submit" disabled={loading}>
            <span className="inline-flex items-center justify-center gap-2 w-full">
              {loading ? 'Creating…' : step === 1 ? (
                <>
                  Continue <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                'Create Account'
              )}
            </span>
          </AuthGradientButton>
        </div>
      </form>

      <AuthSwitchText prompt="Already have an account?" linkText="Sign in" href="/auth/login" />
    </AuthModernCard>
  );
}
