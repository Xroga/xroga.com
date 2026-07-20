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
  const [message, setMessage] = useState('Connecting Vercel…');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthErr =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      searchParams.get('error_code');

    const finishError = (msg: string) => {
      setMessage(msg);
      publishOAuthResult({ type: 'xroga-vercel-error', message: msg });
      if (window.opener && !window.opener.closed) {
        setTimeout(() => window.close(), 1400);
        return;
      }
      const q = new URLSearchParams({ vercel: 'error', message: msg.slice(0, 180) });
      setTimeout(() => router.replace(`/dashboard/integrations?${q.toString()}`), 2200);
    };

    if (oauthErr) {
      finishError(String(oauthErr));
      return;
    }

    if (!code || !state) {
      if (window.opener && !window.opener.closed) {
        window.close();
      } else {
        router.replace('/dashboard/integrations?vercel=missing_code');
      }
      return;
    }

    void (async () => {
      const hasSession = await waitForSession();
      if (!hasSession) {
        finishError('Sign in to Xroga again, then click Authorize Vercel');
        return;
      }

      try {
        const res = await api.vercel.connect(code, state);
        setMessage(`Connected as @${res.username}`);
        publishOAuthResult({
          type: 'xroga-vercel-connected',
          username: res.username,
        });

        if (window.opener && !window.opener.closed) {
          setTimeout(() => window.close(), 500);
          return;
        }

        // Popup lost opener (COOP) or same-tab flow — land on Integrations with success flag
        setMessage(`Connected as @${res.username}. You can close this window.`);
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
          // If close was blocked (same-tab), navigate
          router.replace(
            `/dashboard/integrations?vercel=connected&username=${encodeURIComponent(res.username)}`
          );
        }, 600);
      } catch (e) {
        finishError((e as Error).message || 'Vercel connection failed');
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4 text-center">
      <p className="text-[var(--muted)] font-mono text-sm">{message}</p>
      <p className="text-[11px] text-[var(--muted)] max-w-sm">
        Keep this window open until it finishes. If it fails, go back to Integrations and click
        Authorize Vercel again.
      </p>
    </div>
  );
}

export default function VercelCallbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-20 bg-white/5 rounded-xl" />}>
      <CallbackHandler />
    </Suspense>
  );
}
