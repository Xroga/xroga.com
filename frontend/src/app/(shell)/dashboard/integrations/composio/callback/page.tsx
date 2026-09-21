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

    const failed =
      Boolean(error) ||
      status === 'failed' ||
      status === 'error';

    if (failed) {
      const text =
        error ||
        'App authorization failed.';

      setMessage(text);

      publishOAuthResult({
        type:
          'xroga-composio-error',

        message: text,
      });

      setTimeout(() => {
        try {
          window.close();
        } catch {
          // Ignore.
        }

        if (
          !window.opener ||
          window.opener.closed
        ) {
          const query =
            new URLSearchParams({
              composio:
                'error',

              message:
                text.slice(
                  0,
                  180,
                ),
            });

          router.replace(
            `/dashboard/integrations?${query.toString()}`,
          );
        }
      }, 800);

      return;
    }

    const successMessage =
      'App connected to Xroga';

    setMessage(
      successMessage,
    );

    publishOAuthResult({
      type:
        'xroga-composio-connected',

      message:
        successMessage,
    });

    setTimeout(() => {
      try {
        window.close();
      } catch {
        // Ignore.
      }

      if (
        !window.opener ||
        window.opener.closed
      ) {
        router.replace(
          '/dashboard/integrations?composio=connected',
        );
      }
    }, 600);
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
        You can return to Xroga Integrations after this window closes.
      </p>
    </div>
  );
}

export default function ComposioCallbackPage() {
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
