'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getAccessToken } from '@/lib/api';

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
  const [message, setMessage] = useState('Connecting Chrome Web Store…');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthErr =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      searchParams.get('error_code');

    const finishError = (msg: string) => {
      setMessage(msg);
      setTimeout(
        () =>
          router.replace(
            `/dashboard/publish?cws=error&message=${encodeURIComponent(msg.slice(0, 180))}`,
          ),
        1800,
      );
    };

    if (oauthErr) {
      finishError(String(oauthErr));
      return;
    }

    if (!code || !state) {
      router.replace('/dashboard/publish?cws=missing_code');
      return;
    }

    void (async () => {
      const hasSession = await waitForSession();
      if (!hasSession) {
        finishError('Sign in to Xroga again, then Authorize Chrome Web Store from Publish');
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/dashboard/publish/cws/callback`;
        const res = await api.publish.completeCwsOAuth({ code, state, redirectUri });
        if (!res.ok) {
          finishError(res.error || 'CWS OAuth failed');
          return;
        }
        setMessage(res.message || 'Chrome Web Store connected');
        setTimeout(() => router.replace('/dashboard/publish?cws=connected&tab=chrome'), 700);
      } catch (e) {
        finishError((e as Error).message || 'CWS connection failed');
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4 text-center">
      <p className="text-[var(--muted)] font-mono text-sm">{message}</p>
      <p className="text-[11px] text-[var(--muted)] max-w-sm">
        Keep this window open until it finishes. You will return to Publish.
      </p>
    </div>
  );
}

export default function CwsCallbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-20 bg-white/5 rounded-xl" />}>
      <CallbackHandler />
    </Suspense>
  );
}
