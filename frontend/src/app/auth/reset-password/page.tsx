'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthFlowFrame } from '@/components/auth/AuthFlowFrame';
import { AuthGradientButton, AuthModernInput, AuthModernLabel } from '@/components/auth/AuthModern';
import { getPasswordStrength } from '@/lib/passwordStrength';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => setReady(Boolean(data.user)));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (getPasswordStrength(password).score < 2) { setError('Choose a stronger password.'); return; }
    setPending(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) { setError('Password could not be updated. Request a new link and try again.'); return; }
      setDone(true);
      await createClient().auth.signOut();
      window.setTimeout(() => router.replace('/auth/login?reset=success'), 1200);
    } catch { setError('Password could not be updated. Please try again.'); }
    finally { setPending(false); }
  }

  return <AuthFlowFrame title="Choose a new password" subtitle="Your reset link signs you in temporarily so you can set a new password.">
    {done ? <p role="status" className="text-sm text-emerald-400">Password updated. Taking you to sign in…</p> : !ready ?
      <p role="alert" className="text-sm text-[var(--auth-text)]">This reset link is invalid or expired. Request another link from the sign-in page.</p> :
      <form onSubmit={save} className="space-y-4">
        <div><AuthModernLabel htmlFor="new-password">New password</AuthModernLabel><AuthModernInput id="new-password" type="password" required minLength={8} autoComplete="new-password" icon={<LockKeyhole className="h-4 w-4" />} value={password} onChange={event => setPassword(event.target.value)} /></div>
        <div><AuthModernLabel htmlFor="confirm-password">Confirm password</AuthModernLabel><AuthModernInput id="confirm-password" type="password" required minLength={8} autoComplete="new-password" icon={<LockKeyhole className="h-4 w-4" />} value={confirm} onChange={event => setConfirm(event.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <AuthGradientButton type="submit" disabled={pending}>{pending ? 'Updating…' : 'Update password'}</AuthGradientButton>
      </form>}
  </AuthFlowFrame>;
}
