'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useParams,
  useRouter,
} from 'next/navigation';

import {
  apiFetch,
} from '@/lib/api';

type ConfirmationStatus =
  | 'pending'
  | 'executing'
  | 'consumed'
  | 'cancelled'
  | 'failed'
  | 'expired';

interface SafeConfirmation {
  id: string;

  status:
    ConfirmationStatus;

  summary: string;

  toolkit: string;

  risk:
    | 'read'
    | 'write'
    | 'destructive'
    | 'unknown';

  createdAt: string;

  expiresAt: string;
  request?: string;
  toolSlug?: string;
  argumentsPreview?: string;
}

function displayToolkitName(
  toolkit: string,
): string {
  return toolkit
    .split(
      /[_-]/g,
    )
    .filter(
      Boolean,
    )
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(
          1,
        ),
    )
    .join(
      ' ',
    );
}

export default function BusinessActionConfirmationPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const rawId =
    params?.id;

  const confirmationId =
    typeof rawId ===
      'string'
      ? rawId
      : Array.isArray(
            rawId,
          )
        ? rawId[0] ??
          ''
        : '';

  const [
    confirmation,
    setConfirmation,
  ] =
    useState<
      SafeConfirmation | null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState<
      | 'confirm'
      | 'cancel'
      | null
    >(
      null,
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      '',
    );

  const [nextConfirmationId, setNextConfirmationId] = useState<string | null>(null);

  const [
    error,
    setError,
  ] =
    useState(
      '',
    );

  const load =
    useCallback(
      async () => {
        if (
          !confirmationId
        ) {
          setError(
            'This confirmation link is invalid.',
          );

          setLoading(
            false,
          );

          return;
        }

        setLoading(
          true,
        );

        setError(
          '',
        );

        try {
          const result =
            await apiFetch<{
              confirmation:
                SafeConfirmation;
            }>(
              `/api/phase1/business-actions/confirmations/${encodeURIComponent(
                confirmationId,
              )}`,
            );

          setConfirmation(
            result.confirmation,
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : 'Xroga could not load this confirmation.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },

      [
        confirmationId,
      ],
    );

  useEffect(
    () => {
      void load();
    },

    [
      load,
    ],
  );

  const appName =
    useMemo(
      () =>
        confirmation
          ? displayToolkitName(
              confirmation.toolkit,
            )
          : '',

      [
        confirmation,
      ],
    );

  const expiresLabel =
    useMemo(
      () => {
        if (
          !confirmation
        ) {
          return '';
        }

        const date =
          new Date(
            confirmation.expiresAt,
          );

        return Number.isNaN(
          date.getTime(),
        )
          ? ''
          : date.toLocaleString();
      },

      [
        confirmation,
      ],
    );

  const confirm =
    async () => {
      if (
        !confirmationId ||
        submitting
      ) {
        return;
      }

      setSubmitting(
        'confirm',
      );

      setError(
        '',
      );

      try {
        const result =
          await apiFetch<{
            ok: boolean;

            response: string;

            confirmation:
              SafeConfirmation;

            nextConfirmationId?: string | null;
          }>(
            `/api/phase1/business-actions/confirmations/${encodeURIComponent(
              confirmationId,
            )}/confirm`,

            {
              method:
                'POST',

              body:
                JSON.stringify(
                  {},
                ),
            },
          );

        setConfirmation(
          result.confirmation,
        );

        setMessage(
          result.response ||
            'Action completed.',
        );
        setNextConfirmationId(result.nextConfirmationId ?? null);
      } catch (
        confirmError
      ) {
        setError(
          confirmError instanceof
            Error
            ? confirmError.message
            : 'Xroga could not complete this action.',
        );

        await load();
      } finally {
        setSubmitting(
          null,
        );
      }
    };

  const cancel =
    async () => {
      if (
        !confirmationId ||
        submitting
      ) {
        return;
      }

      setSubmitting(
        'cancel',
      );

      setError(
        '',
      );

      try {
        const result =
          await apiFetch<{
            ok: boolean;

            confirmation:
              SafeConfirmation;
          }>(
            `/api/phase1/business-actions/confirmations/${encodeURIComponent(
              confirmationId,
            )}/cancel`,

            {
              method:
                'POST',

              body:
                JSON.stringify(
                  {},
                ),
            },
          );

        setConfirmation(
          result.confirmation,
        );

        setMessage(
          result.confirmation
            .status ===
          'cancelled'
            ? 'Action cancelled. Nothing was changed.'
            : 'This action is no longer pending.',
        );
      } catch (
        cancelError
      ) {
        setError(
          cancelError instanceof
            Error
            ? cancelError.message
            : 'Xroga could not cancel this action.',
        );

        await load();
      } finally {
        setSubmitting(
          null,
        );
      }
    };

  const pending =
    confirmation
      ?.status ===
    'pending';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          Xroga Connect
        </p>

        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Review action
        </h1>

        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          High-risk connected-app actions run only after you approve the exact prepared action.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Loading confirmation…
          </p>
        </div>
      ) : error && !confirmation ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Confirmation unavailable
          </p>

          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {error}
          </p>
        </div>
      ) : confirmation ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <div className="space-y-5 p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Exact action
              </p>

              <p className="mt-2 text-base font-medium leading-7 text-[var(--text-primary)]">
                {confirmation.summary}
              </p>
            </div>

            {confirmation.request ? <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.06] px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-500">Your original request</p><p className="mt-1 text-sm leading-6 text-[var(--text-primary)]">{confirmation.request}</p></div> : null}

            {confirmation.toolSlug ? <div className="rounded-xl border border-[var(--border-subtle)] px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Prepared app operation</p><p className="mt-1 break-all font-mono text-sm text-[var(--text-primary)]">{confirmation.toolSlug}</p><p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Arguments to review (secrets redacted)</p><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-[var(--text-primary)]">{confirmation.argumentsPreview ?? '{}'}</pre></div> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Application
                </p>

                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {appName}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Risk
                </p>

                <p className="mt-1 text-sm font-medium capitalize text-[var(--text-primary)]">
                  {confirmation.risk}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Status
                </p>

                <p className="mt-1 text-sm font-medium capitalize text-[var(--text-primary)]">
                  {confirmation.status}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Expires
                </p>

                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {expiresLabel || 'Soon'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] px-4 py-3">
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Xroga keeps the provider session, OAuth credentials, and plan digest on the server. Review the operation and redacted arguments above. Confirming this page authorizes this one prepared action only.
              </p>
            </div>

            {message ? (
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {message}
              </p>
            ) : null}

            {nextConfirmationId ? <a className="inline-flex rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white" href={`/dashboard/actions/confirm/${encodeURIComponent(nextConfirmationId)}`}>Review next workflow step</a> : null}

            {error ? (
              <p className="text-sm text-red-500">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] p-4 sm:flex-row sm:justify-end">
            {pending ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void cancel();
                  }}
                  disabled={Boolean(
                    submitting,
                  )}
                  className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-opacity disabled:opacity-50"
                >
                  {submitting ===
                  'cancel'
                    ? 'Cancelling…'
                    : 'Cancel'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void confirm();
                  }}
                  disabled={Boolean(
                    submitting,
                  )}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                >
                  {submitting ===
                  'confirm'
                    ? 'Confirming…'
                    : 'Confirm action'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  router.back();
                }}
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]"
              >
                Back to Xroga
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
