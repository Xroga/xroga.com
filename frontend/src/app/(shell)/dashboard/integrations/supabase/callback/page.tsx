'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Authorizing Supabase…');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const err = searchParams.get('error_description') || searchParams.get('error');

    if (err) {
      setMessage(err);
      if (window.opener) {
        window.opener.postMessage({ type: 'xroga-supabase-error', message: err }, '*');
        setTimeout(() => window.close(), 1200);
      } else {
        setTimeout(() => router.replace('/dashboard/integrations'), 2500);
      }
      return;
    }

    if (!code || !state) {
      if (window.opener) window.close();
      else router.replace('/dashboard/integrations');
      return;
    }

    void api.supabase
      .connect(code, state)
      .then((res) => {
        const msg =
          res.message ||
          (res.autoSelected
            ? 'Supabase connected — schema & memory set up automatically'
            : 'Supabase authorized');
        setMessage(msg);

        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'xroga-supabase-connected',
              needsProjectPick: Boolean(res.needsProjectPick),
              projects: res.projects ?? [],
              autoSelected: res.autoSelected,
              provisioned: Boolean(res.provision?.schemaApplied || res.status?.provisioned),
              message: msg,
            },
            '*',
          );
          setTimeout(() => window.close(), 500);
          return;
        }

        const q = new URLSearchParams({ supabase: 'connected' });
        if (res.needsProjectPick) q.set('pick', '1');
        router.replace(`/dashboard/integrations?${q.toString()}`);
      })
      .catch((e) => {
        const msg = (e as Error).message;
        setMessage(msg);
        if (window.opener) {
          window.opener.postMessage({ type: 'xroga-supabase-error', message: msg }, '*');
          setTimeout(() => window.close(), 1200);
          return;
        }
        setTimeout(() => router.replace('/dashboard/integrations'), 2500);
      });
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-[var(--muted)] font-mono text-sm">{message}</p>
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
