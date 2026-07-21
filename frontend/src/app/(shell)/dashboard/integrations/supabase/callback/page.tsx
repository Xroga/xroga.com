'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getAccessToken } from '@/lib/api';
import { publishOAuthResult } from '@/lib/oauthPopupResult';

async function waitForSession(maxMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const token = await getAccessToken();
    if (token) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Authorizing Supabase…');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const err = searchParams.get('error_description') || searchParams.get('error');

    const finishError = (msg: string) => {
      setMessage(msg);
      publishOAuthResult({ type: 'xroga-supabase-error', message: msg });
      if (window.opener && !window.opener.closed) {
        setTimeout(() => window.close(), 1200);
      } else {
        const q = new URLSearchParams({ supabase: 'error', message: msg.slice(0, 180) });
        setTimeout(() => router.replace(`/dashboard/integrations?${q.toString()}`), 2500);
      }
    };

    if (err) {
      finishError(String(err));
      return;
    }

    if (!code || !state) {
      if (window.opener) window.close();
      else router.replace('/dashboard/integrations?supabase=missing_code');
      return;
    }

    void (async () => {
      const hasSession = await waitForSession();
      if (!hasSession) {
        finishError('Sign in to Xroga again, then click Authorize Supabase');
        return;
      }

      try {
        const res = await api.supabase.connect(code, state);
        const msg =
          res.message ||
          (res.autoSelected
            ? 'Supabase connected — schema & memory set up automatically'
            : 'Supabase authorized');
        setMessage(msg);

        const payload = {
          type: 'xroga-supabase-connected' as const,
          needsProjectPick: Boolean(res.needsProjectPick),
          projects: res.projects ?? [],
          autoSelected: Boolean(res.autoSelected),
          provisioned: Boolean(res.provision?.schemaApplied || res.status?.provisioned),
          message: msg,
        };
        publishOAuthResult(payload);

        // Always try to close popup; if COOP blocked opener, parent polls status
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
          if (!window.opener || window.opener.closed) {
            const q = new URLSearchParams({ supabase: 'connected' });
            if (res.needsProjectPick) q.set('pick', '1');
            router.replace(`/dashboard/integrations?${q.toString()}#ship-setup`);
          }
        }, 400);
      } catch (e) {
        finishError((e as Error).message || 'Supabase connection failed');
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4 text-center">
      <p className="text-[var(--muted)] font-mono text-sm">{message}</p>
      <p className="text-[11px] text-[var(--muted)] max-w-sm">
        Keep this window open until it finishes. If it fails, go back to Integrations and click
        Authorize Supabase again.
      </p>
    </div>
  );
}

export default function SupabaseCallbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-20 bg-white/5 rounded-xl" />}>
      <CallbackHandler />
    </Suspense>
  );
}
