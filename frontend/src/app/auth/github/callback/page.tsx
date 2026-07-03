'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { dispatchGitHubConnected } from '@/lib/githubEvents';

function GitHubAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Connecting GitHub…');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      if (window.opener) {
        window.close();
      } else {
        router.replace('/dashboard/integrations');
      }
      return;
    }

    void api.github
      .connect(code, 'auto')
      .then((res) => {
        setMessage(`Connected as @${res.username}`);
        if (window.opener) {
          window.opener.postMessage({ type: 'xroga-github-connected', username: res.username }, '*');
          dispatchGitHubConnected(res.username);
          setTimeout(() => window.close(), 400);
        } else {
          router.replace(
            `/dashboard?github=connected&username=${encodeURIComponent(res.username)}`
          );
        }
      })
      .catch((e) => {
        setMessage((e as Error).message);
        if (!window.opener) {
          setTimeout(() => router.replace('/dashboard/integrations'), 2000);
        }
      });
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-[var(--muted)]">{message}</p>
    </div>
  );
}

export default function AuthGitHubCallbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-20 bg-white/5 rounded-xl" />}>
      <GitHubAuthCallback />
    </Suspense>
  );
}
