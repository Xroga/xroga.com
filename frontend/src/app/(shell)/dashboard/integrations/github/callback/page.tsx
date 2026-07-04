'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { dispatchGitHubConnected } from '@/lib/githubEvents';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Connecting GitHub…');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      if (window.opener) {
        window.close();
      } else {
        router.replace('/dashboard');
      }
      return;
    }

    void api.github
      .connect(code, 'auto')
      .then((res) => {
        setMessage(`Connected as @${res.username}`);

        if (window.opener) {
          window.opener.postMessage(
            { type: 'xroga-github-connected', username: res.username },
            '*'
          );
          dispatchGitHubConnected(res.username);
          setTimeout(() => window.close(), 400);
          return;
        }

        const user = encodeURIComponent(res.username);
        router.replace(`/dashboard?github=connected&username=${user}`);
      })
      .catch((e) => {
        const msg = (e as Error).message;
        setMessage(msg);
        if (window.opener) {
          window.opener.postMessage({ type: 'xroga-github-error', message: msg }, '*');
          setTimeout(() => window.close(), 1200);
          return;
        }
        setTimeout(() => router.replace('/dashboard'), 2500);
      });
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
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
