'use client';

import { useState, useMemo, useEffect } from 'react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SIGNUP_QUOTES, randomQuote } from '@/lib/authQuotes';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { api } from '@/lib/api';
import { isTemporaryEmail } from '@/lib/emailValidation';
import { getPasswordStrength } from '@/lib/passwordStrength';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/useThemeStore';
import { THEME_OPTIONS, type CoreThemeId } from '@/lib/theme';
import { getStoredReferralCode, storeReferralCode, clearStoredReferralCode } from '@/lib/referralStorage';
import {
  AuthModernCard,
  AuthModernQuote,
  AuthModernInput,
  AuthModernLabel,
  AuthGradientButton,
  AuthSwitchText,
} from './AuthModern';

export function SignupForm() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get('ref');
  const [referralCode, setReferralCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(XROGA_PROFILE_AVATARS[0]?.url ?? '');
  const [theme, setTheme] = useState<CoreThemeId>('white');
  const setGlobalTheme = useThemeStore((s) => s.setTheme);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const quote = useMemo(() => randomQuote(SIGNUP_QUOTES), []);
  const pwdStrength = getPasswordStrength(password);

  useEffect(() => {
    const code = refFromUrl ?? getStoredReferralCode();
    if (code) {
      setReferralCode(code.toUpperCase());
      storeReferralCode(code);
    }
  }, [refFromUrl]);

  async function handleGitHub() {
    setError('');
    setOauthLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setOauthLoading(false);
      setError(err.message);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name');
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
    setGlobalTheme(theme);

    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName, avatar_url: avatarUrl, preferred_theme: theme },
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

    const code = referralCode.trim() || getStoredReferralCode();
    if (code) {
      try {
        const result = await api.referrals.apply(code);
        if (result.success) clearStoredReferralCode();
      } catch {
        /* apply on dashboard if session not ready */
      }
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/workspace'), 1500);
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
    <AuthModernCard title="Create your Xroga account" subtitle="~0.55M free trial tokens · pick your vibe">
      <AuthModernQuote text={quote.text} author={quote.author} compact />

      <div className="mb-3">
        <button
          type="button"
          onClick={handleGitHub}
          disabled={oauthLoading || loading}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-sky-100 bg-slate-50/80 text-sm font-semibold text-slate-800 transition-colors hover:border-[#006aff]/40 disabled:opacity-60"
        >
          <GitHubIcon className="h-5 w-5 shrink-0" />
          Continue with GitHub
        </button>
      </div>

      <div className="relative mb-3">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-sky-100" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">or</span>
        </div>
      </div>

      <form onSubmit={handleSignup} className="space-y-3">
        <div>
          <AuthModernLabel>Workspace theme</AuthModernLabel>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={cn(
                  'text-left px-3 py-2 rounded-xl border text-xs transition-all',
                  theme === opt.id
                    ? 'border-[#006aff] bg-[#006aff]/10 ring-1 ring-[#006aff]/40'
                    : 'border-sky-100 bg-slate-50/80 hover:border-[#006aff]/40'
                )}
              >
                <p className="font-bold text-slate-800 font-claude">{opt.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-coding">{opt.description}</p>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">Change anytime from the paint icon in chat or Settings.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-11 h-11 rounded-lg overflow-hidden ring-2 ring-[#006aff]/25 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 grid grid-cols-6 gap-1 max-h-16 overflow-y-auto p-1.5 rounded-xl bg-slate-50/80 border border-sky-100">
            {XROGA_PROFILE_AVATARS.slice(0, 12).map((a) => (
              <button
                key={a.url}
                type="button"
                onClick={() => setAvatarUrl(a.url)}
                className={cn(
                  'aspect-square rounded-md overflow-hidden border-2',
                  avatarUrl === a.url ? 'border-[#006aff]' : 'border-transparent opacity-70'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <AuthModernLabel>Display name</AuthModernLabel>
          <AuthModernInput
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="How should we call you?"
          />
        </div>

        <div>
          <AuthModernLabel>Email</AuthModernLabel>
          <AuthModernInput
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
            </div>
          )}
        </div>

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

        <AuthGradientButton type="submit" disabled={loading || oauthLoading}>
          {loading ? 'Creating…' : 'Create Account'}
        </AuthGradientButton>
      </form>

      <AuthSwitchText prompt="Already have an account?" linkText="Sign in" href="/auth/login" />
    </AuthModernCard>
  );
}
