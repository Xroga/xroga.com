'use client';

import { type FormEvent, useState } from 'react';
import { Mail } from 'lucide-react';
import { AuthFlowFrame } from '@/components/auth/AuthFlowFrame';
import { AuthGradientButton, AuthModernInput, AuthModernLabel } from '@/components/auth/AuthModern';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setPending(true);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fauth%2Freset-password`,
      });
      if (resetError && (resetError.status === 429 || /rate limit/i.test(resetError.message))) {
        setError('Please wait before requesting another reset email.');
      } else if (resetError && ((resetError.status ?? 0) >= 500 || /smtp|send|mailer/i.test(resetError.message))) {
        setError('The reset email service is unavailable right now. Please try again later.');
      } else {
        // Do not reveal whether this address has an account.
        setSent(true);
      }
    } catch {
      setError('The reset request could not be completed. Please try again.');
    } finally { setPending(false); }
  }

  return <AuthFlowFrame title="Reset your password" subtitle="Enter your account email and we’ll send a secure reset link if an account exists.">
    {sent ? <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-[var(--auth-text)]">If this email belongs to an account, a password-reset link is on its way. Check your inbox and spam folder.</p> :
      <form onSubmit={requestReset} className="space-y-4">
        <div><AuthModernLabel htmlFor="reset-email">Email address</AuthModernLabel>
          <AuthModernInput id="reset-email" type="email" autoComplete="email" required icon={<Mail className="h-4 w-4" />} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <AuthGradientButton type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</AuthGradientButton>
      </form>}
  </AuthFlowFrame>;
}
