'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Connecting Vercel…');

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

    void api.vercel
      .connect(code)
      .then((res) => {
        setMessage(`Connected as @${res.username}`);

        if (window.opener) {
          window.opener.postMessage(
            { type: 'xroga-vercel-connected', username: res.username },
            '*'
          );
          setTimeout(() => window.close(), 400);
          return;
        }

        router.replace(`/workspace?vercel=connected&username=${encodeURIComponent(res.username)}`);
      })
      .catch((e) => {
        const msg = (e as Error).message;
        setMessage(msg);
        if (window.opener) {
          window.opener.postMessage({ type: 'xroga-vercel-error', message: msg }, '*');
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

export default function VercelCallbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-20 bg-white/5 rounded-xl" />}>
      <CallbackHandler />
    </Suspense>
  );
}
