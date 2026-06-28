'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SIGNUP_QUOTES, randomQuote } from '@/lib/authQuotes';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { generateAvatarUrl } from '@/lib/avatarGenerate';
import { api } from '@/lib/api';
import { isTemporaryEmail } from '@/lib/emailValidation';
import { getPasswordStrength } from '@/lib/passwordStrength';
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
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();
  const quote = useMemo(() => randomQuote(SIGNUP_QUOTES), []);
  const pwdStrength = getPasswordStrength(password);

  async function handleMagicSignup() {
    if (!email.trim()) {
      setError('Enter your email');
      return;
    }
    if (isTemporaryEmail(email)) {
      setError('Temporary email addresses are not allowed. Use a real email.');
      return;
    }
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: displayName.trim(), avatar_url: avatarUrl },
      },
    });

    if (err) {
      setError(err.message);
    } else {
      setMagicLinkSent(true);
    }
    setLoading(false);
  }

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

    if (isTemporaryEmail(email)) {
      setError('Temporary email addresses are not allowed. Use a real email.');
      return;
    }
    if (pwdStrength.score < 2) {
      setError('Please choose a stronger password');
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

  if (magicLinkSent) {
    return (
      <AuthModernCard title="Check Email">
        <p className="text-center text-sm text-slate-600 mt-4 py-4">
          Magic link sent to <strong>{email}</strong>. Click it to finish creating your account.
        </p>
      </AuthModernCard>
    );
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
      subtitle={step === 1 ? '50 free Actions — pick photo & name' : undefined}
    >
      <AuthModernQuote text={quote.text} author={quote.author} compact />
      <AuthStepDots step={step} />

      <form onSubmit={handleSignup} className="space-y-3">
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden ring-2 ring-[#006aff]/25 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <AuthModernLabel>Pick a photo</AuthModernLabel>
                <div className="grid grid-cols-6 gap-1.5 p-2 rounded-xl bg-slate-50/80 border border-sky-100 max-h-20 overflow-y-auto">
                  {XROGA_PROFILE_AVATARS.map((a) => (
                    <button
                      key={a.url}
                      type="button"
                      onClick={() => setAvatarUrl(a.url)}
                      className={cn(
                        'aspect-square rounded-lg overflow-hidden border-2 transition-all',
                        avatarUrl === a.url
                          ? 'border-[#006aff] scale-105'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
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
                  className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-[#006aff] to-[#60a5fa] text-white flex items-center justify-center"
                  title="Generate"
                >
                  <Sparkles className="w-4 h-4" />
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
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-sky-50/80 border border-sky-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                <button type="button" onClick={() => setStep(1)} className="text-xs xv-auth-gradient-text font-semibold">
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
              {password && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pwdStrength.percent}%`, backgroundColor: pwdStrength.color }}
                    />
                  </div>
                  <p className="text-[10px] mt-1 font-semibold" style={{ color: pwdStrength.color }}>
                    {pwdStrength.label}
                  </p>
                </div>
              )}
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

        {step === 2 && (
          <p className="text-center text-xs text-slate-500">
            No password?{' '}
            <button
              type="button"
              onClick={() => void handleMagicSignup()}
              disabled={loading}
              className="xv-auth-gradient-text font-semibold hover:opacity-80"
            >
              Create with magic link
            </button>
          </p>
        )}
      </form>

      <AuthSwitchText prompt="Already have an account?" linkText="Sign in" href="/auth/login" />
    </AuthModernCard>
  );
}
