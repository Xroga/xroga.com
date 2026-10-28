'use client';

import { type FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone } from 'lucide-react';
import { AuthFlowFrame } from '@/components/auth/AuthFlowFrame';
import { AuthGradientButton, AuthModernInput, AuthModernLabel } from '@/components/auth/AuthModern';
import { normalizeContactPhone } from '@/lib/contactPhone';
import { createClient } from '@/lib/supabase/client';
import { safeAuthNextPath } from '@/lib/supabase/oauthReturn';

function ContactForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get('next');
  const safeNext = safeAuthNextPath(requestedNext, '/onboarding');
  const next = safeNext.startsWith('/auth') ? '/onboarding' : safeNext;
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/auth/login');
      else setReady(true);
    });
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeContactPhone(phone);
    if (!normalized) { setError('Enter your phone with country code, for example +1 412 555 0123.'); return; }
    setError(''); setPending(true);
    try {
      const { data, error: saveError } = await createClient().rpc('save_current_contact_phone', { p_contact_phone: normalized });
      if (saveError || !data) { setError('Could not save your contact number. Please try again.'); return; }
      router.replace(next); router.refresh();
    } catch { setError('Could not save your contact number. Please try again.'); }
    finally { setPending(false); }
  }

  async function signOut() {
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) { setError('Could not sign out. Please try again.'); return; }
    router.replace('/auth/login');
    router.refresh();
  }

  return <AuthFlowFrame hideBack title="One contact detail" subtitle="Add a phone number before entering Xroga. We won’t send a verification code or use it to sign you in.">
    <form onSubmit={save} className="space-y-4">
      <div><AuthModernLabel htmlFor="contact-phone">Contact phone number</AuthModernLabel>
        <AuthModernInput id="contact-phone" type="tel" required autoComplete="tel" icon={<Phone className="h-4 w-4" />} value={phone} onChange={event => setPhone(event.target.value)} placeholder="+1 412 555 0123" />
        <p className="mt-2 text-xs text-[var(--auth-muted)]">Required for account contact. This number is unverified and not used for login or marketing consent.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <AuthGradientButton type="submit" disabled={!ready || pending}>{pending ? 'Saving…' : 'Continue to Xroga'}</AuthGradientButton>
      <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs text-[var(--auth-muted)] hover:underline">Sign out instead</button>
    </form>
  </AuthFlowFrame>;
}

export default function ContactPage() {
  return <Suspense fallback={null}><ContactForm /></Suspense>;
}
