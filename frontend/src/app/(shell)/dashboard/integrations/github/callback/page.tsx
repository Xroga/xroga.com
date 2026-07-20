'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getAccessToken } from '@/lib/api';
import { dispatchGitHubConnected } from '@/lib/githubEvents';
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
  const [message, setMessage] = useState('Connecting GitHub…');

  useEffect(() => {
    const code = searchParams.get('code');
    const oauthErr =
      searchParams.get('error_description') || searchParams.get('error');

    const finishError = (msg: string) => {
      setMessage(msg);
      publishOAuthResult({ type: 'xroga-github-error', message: msg });
      if (window.opener && !window.opener.closed) {
        setTimeout(() => window.close(), 1400);
        return;
      }
      const q = new URLSearchParams({ github: 'error', message: msg.slice(0, 180) });
      setTimeout(() => router.replace(`/dashboard/integrations?${q.toString()}`), 2200);
    };

    if (oauthErr) {
      finishError(String(oauthErr));
      return;
    }

    if (!code) {
      if (window.opener) {
        window.close();
      } else {
        router.replace('/dashboard/integrations?github=missing_code');
      }
      return;
    }

    void (async () => {
      const hasSession = await waitForSession();
      if (!hasSession) {
        finishError('Sign in to Xroga again, then click Authorize GitHub');
        return;
      }

      try {
        const res = await api.github.connect(code, 'auto');
        setMessage(`Connected as @${res.username}`);

        publishOAuthResult({
          type: 'xroga-github-connected',
          username: res.username,
        });
        dispatchGitHubConnected(res.username);

        if (window.opener && !window.opener.closed) {
          setTimeout(() => window.close(), 400);
          return;
        }

        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
          router.replace(
            `/dashboard/integrations?github=connected&username=${encodeURIComponent(res.username)}`
          );
        }, 500);
      } catch (e) {
        finishError((e as Error).message || 'GitHub connection failed');
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4 text-center">
      <p className="text-[var(--muted)] font-mono text-sm">{message}</p>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-20 bg-white/5 rounded-xl" />}>
      <CallbackHandler />
    </Suspense>
  );
}
