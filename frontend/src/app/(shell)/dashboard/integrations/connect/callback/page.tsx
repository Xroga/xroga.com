'use client';

import {
  Suspense,
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  publishOAuthResult,
} from '@/lib/oauthPopupResult';
import { xrogaConnect } from '@/lib/xrogaConnect';

function CallbackHandler() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    message,
    setMessage,
  ] =
    useState(
      'Finishing connection…',
    );

  useEffect(() => {
    let cancelled = false;
    const toolkit = searchParams.get('toolkit')?.toLowerCase() ?? '';
    const accountId = searchParams.get('connected_account_id') ?? '';
    const error =
      searchParams.get(
        'error_description',
      ) ||
      searchParams.get(
        'error',
      );

    const status =
      searchParams.get(
        'status',
      );

    const finish = (success: boolean, text: string) => {
      if (cancelled) return;
      setMessage(text);
      publishOAuthResult({ type: success ? 'xroga-composio-connected' : 'xroga-composio-error', message: text });
      setTimeout(() => {
        if (cancelled) return;
        if (window.opener && !window.opener.closed) window.close();
        else router.replace(success && toolkit
          ? `/dashboard/integrations/${encodeURIComponent(toolkit)}?connected=1`
          : `/dashboard/integrations?plugin=error&message=${encodeURIComponent(text.slice(0, 180))}`);
      }, 700);
    };

    if (error || status !== 'success' || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(toolkit)) {
      finish(false, error || 'App authorization did not return a verifiable success status.');
      return () => { cancelled = true; };
    }

    const verify = async () => {
      setMessage('Checking the app connection…');
      try {
        const session = await xrogaConnect.session();
        for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
          const response = await xrogaConnect.toolkits(session.sessionId, { toolkits: [toolkit] });
          const connected = response.toolkits.find((item) => item.toolkit === toolkit && item.connected);
          if (connected && (!accountId || connected.connectedAccountId === accountId)) {
            finish(true, 'App connected to Xroga');
            return;
          }
          if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        finish(false, 'Authorization returned, but the app is not ACTIVE in this Xroga account. Check the app connection and try again.');
      } catch {
        finish(false, 'Xroga could not verify the app connection. Refresh its plugin page before using it.');
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [
    router,
    searchParams,
  ]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {message}
      </p>

      <p className="max-w-sm text-xs leading-5 text-[var(--text-muted)]">
        You can return to Xroga Plugins after this window closes.
      </p>
    </div>
  );
}

export default function PluginConnectionCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] animate-pulse" />
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
