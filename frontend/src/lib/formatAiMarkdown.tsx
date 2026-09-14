'use client';

import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import ReactMarkdown, {
  type Components,
  type UrlTransform,
} from 'react-markdown';

import remarkGfm from 'remark-gfm';

import {
  ApiError,
  apiFetch,
} from '@/lib/api';

function joinClasses(
  ...values:
    Array<
      string |
      undefined
    >
): string {
  return values
    .filter(
      Boolean,
    )
    .join(
      ' ',
    );
}

/** Blocks script/data protocols while retaining normal web, mail, fragment and app-relative links. */
export const safeMarkdownUrl:
  UrlTransform = (
    url,
    key,
  ) => {
    const value =
      url.trim();

    if (
      !value
    ) {
      return '';
    }

    if (
      value.startsWith(
        '#',
      ) ||
      value.startsWith(
        '/',
      ) ||
      value.startsWith(
        './',
      ) ||
      value.startsWith(
        '../',
      )
    ) {
      return value;
    }

    try {
      const parsed =
        new URL(
          value,
        );

      if (
        key ===
        'src'
      ) {
        return parsed.protocol ===
          'https:'
          ? value
          : '';
      }

      return [
        'https:',
        'http:',
        'mailto:',
      ].includes(
        parsed.protocol,
      )
        ? value
        : '';
    } catch {
      return '';
    }
  };

const CONFIRMATION_PATH =
  /^\/dashboard\/actions\/confirm\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

function confirmationIdFromHref(
  href:
    string |
    undefined,
): string | null {
  if (
    !href
  ) {
    return null;
  }

  try {
    const parsed =
      new URL(
        href,
        'https://xroga.local',
      );

    return (
      parsed.pathname.match(
        CONFIRMATION_PATH,
      )?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

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
  summary:
    string;
  toolkit:
    string;
  risk:
    'read' |
    'write' |
    'destructive' |
    'unknown';
  createdAt:
    string;
  expiresAt:
    string;
}

function toolkitLabel(
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
        part.slice(1),
    )
    .join(
      ' ',
    );
}

function BusinessActionConfirmationInline({
  confirmationId,
}: {
  confirmationId:
    string;
}) {
  const [
    confirmation,
    setConfirmation,
  ] =
    useState<
      SafeConfirmation |
      null
    >(
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      'confirm' |
      'cancel' |
      null
    >(
      null,
    );

  const [
    notice,
    setNotice,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      let active =
        true;

      void apiFetch<{
        confirmation:
          SafeConfirmation;
      }>(
        `/api/phase1/business-actions/confirmations/${encodeURIComponent(
          confirmationId,
        )}`,
      )
        .then(
          (result) => {
            if (
              active
            ) {
              setConfirmation(
                result.confirmation,
              );
            }
          },
        )
        .catch(
          (error) => {
            if (
              active
            ) {
              setFailed(
                true,
              );

              setNotice(
                error instanceof
                  Error
                  ? error.message
                  : 'This action confirmation is unavailable.',
              );
            }
          },
        );

      return () => {
        active =
          false;
      };
    },
    [
      confirmationId,
    ],
  );

  const confirm =
    useCallback(
      async () => {
        if (
          busy ||
          confirmation
            ?.status !==
            'pending'
        ) {
          return;
        }

        setBusy(
          'confirm',
        );

        setFailed(
          false,
        );

        setNotice(
          null,
        );

        try {
          const result =
            await apiFetch<{
              ok: boolean;
              response:
                string;
              toolkit:
                string;
              confirmation:
                SafeConfirmation;
            }>(
              `/api/phase1/business-actions/confirmations/${encodeURIComponent(
                confirmationId,
              )}/confirm`,
              {
                method:
                  'POST',
              },
            );

          setConfirmation(
            result.confirmation,
          );

          setNotice(
            result.response,
          );
        } catch (
          error
        ) {
          const message =
            error instanceof
            ApiError
              ? error.message
              : error instanceof
                  Error
                ? error.message
                : 'Xroga could not confirm this action.';

          setFailed(
            true,
          );

          setNotice(
            message,
          );
        } finally {
          setBusy(
            null,
          );
        }
      },
      [
        busy,
        confirmation
          ?.status,
        confirmationId,
      ],
    );

  const cancel =
    useCallback(
      async () => {
        if (
          busy ||
          confirmation
            ?.status !==
            'pending'
        ) {
          return;
        }

        setBusy(
          'cancel',
        );

        setFailed(
          false,
        );

        setNotice(
          null,
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
              },
            );

          setConfirmation(
            result.confirmation,
          );

          setNotice(
            result.confirmation
              .status ===
              'cancelled'
              ? 'Cancelled. Nothing was changed.'
              : `This action is already ${result.confirmation.status}.`,
          );
        } catch (
          error
        ) {
          setFailed(
            true,
          );

          setNotice(
            error instanceof
              Error
              ? error.message
              : 'Xroga could not cancel this action.',
          );
        } finally {
          setBusy(
            null,
          );
        }
      },
      [
        busy,
        confirmation
          ?.status,
        confirmationId,
      ],
    );

  const status =
    confirmation
      ?.status;

  return (
    <span className="my-2 flex w-full max-w-xl flex-col gap-2 rounded-xl border border-[var(--card-border)]/70 bg-[var(--foreground)]/[0.025] p-3 align-top">
      <span className="flex items-center justify-between gap-3">
        <span className="font-semibold text-[var(--foreground)]">
          Confirm external action
        </span>

        {confirmation ? (
          <span className="rounded-full border border-[var(--card-border)]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]/60">
            {toolkitLabel(
              confirmation.toolkit,
            )}
            {' · '}
            {confirmation.risk}
          </span>
        ) : null}
      </span>

      {confirmation ? (
        <span className="text-[13px] leading-relaxed text-[var(--foreground)]/80">
          {confirmation.summary}
        </span>
      ) : !failed ? (
        <span className="text-[13px] text-[var(--foreground)]/65">
          Loading the exact pending action…
        </span>
      ) : null}

      {status ===
      'pending' ? (
        <span className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={
              confirm
            }
            disabled={
              Boolean(
                busy,
              )
            }
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ===
            'confirm'
              ? 'Confirming…'
              : 'Confirm action'}
          </button>

          <button
            type="button"
            onClick={
              cancel
            }
            disabled={
              Boolean(
                busy,
              )
            }
            className="rounded-lg border border-[var(--card-border)]/70 px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)]/75 transition-colors hover:bg-[var(--foreground)]/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ===
            'cancel'
              ? 'Cancelling…'
              : 'Cancel'}
          </button>

          <span className="text-[11px] text-[var(--foreground)]/50">
            Executes once only.
          </span>
        </span>
      ) : null}

      {status &&
      status !==
        'pending' &&
      !notice ? (
        <span className="text-[12px] font-medium text-[var(--foreground)]/70">
          Action status: {status}
        </span>
      ) : null}

      {notice ? (
        <span
          className={joinClasses(
            'text-[12px] font-medium',
            failed
              ? 'text-red-500'
              : 'text-[var(--foreground)]/75',
          )}
        >
          {notice}
        </span>
      ) : null}
    </span>
  );
}

const components:
  Components = {
    h1: ({
      children,
    }) => (
      <h3 className="mt-1 border-b border-[var(--card-border)]/30 pb-1 text-lg font-bold tracking-tight text-[var(--foreground)] sm:text-xl">
        {children}
      </h3>
    ),

    h2: ({
      children,
    }) => (
      <h3 className="mt-0.5 border-b border-[var(--card-border)]/30 pb-1 text-base font-bold tracking-tight text-[var(--foreground)] sm:text-lg">
        {children}
      </h3>
    ),

    h3: ({
      children,
    }) => (
      <h4 className="text-[15px] font-bold tracking-tight text-[var(--accent)]">
        {children}
      </h4>
    ),

    h4: ({
      children,
    }) => (
      <h5 className="text-[14px] font-semibold text-[var(--foreground)]">
        {children}
      </h5>
    ),

    p: ({
      children,
    }) => (
      <p className="text-[var(--foreground)]/95">
        {children}
      </p>
    ),

    strong: ({
      children,
    }) => (
      <strong className="font-semibold text-[var(--foreground)]">
        {children}
      </strong>
    ),

    em: ({
      children,
    }) => (
      <em className="italic text-[var(--foreground)]/90">
        {children}
      </em>
    ),

    a: ({
      href,
      children,
    }) => {
      const confirmationId =
        confirmationIdFromHref(
          href,
        );

      if (
        confirmationId
      ) {
        return (
          <BusinessActionConfirmationInline
            confirmationId={
              confirmationId
            }
          />
        );
      }

      return (
        <a
          href={
            href
          }
          target={
            href?.startsWith(
              'http',
            )
              ? '_blank'
              : undefined
          }
          rel={
            href?.startsWith(
              'http',
            )
              ? 'noreferrer noopener'
              : undefined
          }
          className="font-medium text-[var(--accent)] underline decoration-[var(--accent)]/35 underline-offset-2 hover:decoration-[var(--accent)]"
        >
          {children}
        </a>
      );
    },

    ul: ({
      children,
    }) => (
      <ul className="list-disc space-y-1 pl-5 marker:text-[var(--accent)]">
        {children}
      </ul>
    ),

    ol: ({
      children,
    }) => (
      <ol className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-[var(--accent)]">
        {children}
      </ol>
    ),

    li: ({
      children,
    }) => (
      <li className="pl-0.5 text-[var(--foreground)]/95">
        {children}
      </li>
    ),

    blockquote: ({
      children,
    }) => (
      <blockquote className="rounded-r-lg border-l-2 border-[var(--accent)]/50 bg-[var(--accent)]/5 px-3 py-2 text-[var(--foreground)]/85">
        {children}
      </blockquote>
    ),

    hr: () => (
      <hr className="my-2 border-[var(--card-border)]/50" />
    ),

    code: ({
      className,
      children,
    }) => {
      const fenced =
        Boolean(
          className?.startsWith(
            'language-',
          ),
        ) ||
        String(
          children,
        ).includes(
          '\n',
        );

      return fenced ? (
        <code
          className={joinClasses(
            'block overflow-x-auto whitespace-pre p-3 font-mono text-[12px] leading-relaxed text-[var(--foreground)]',
            className,
          )}
        >
          {children}
        </code>
      ) : (
        <code className="rounded bg-[var(--muted)]/15 px-1 py-0.5 font-mono text-[11px] text-[var(--accent)]">
          {children}
        </code>
      );
    },

    pre: ({
      children,
    }) => (
      <pre className="overflow-x-auto rounded-xl border border-[var(--card-border)]/60 bg-[var(--foreground)]/[0.035]">
        {children}
      </pre>
    ),

    table: ({
      children,
    }) => (
      <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]/60">
        <table className="w-full text-[13px] sm:text-[14px]">
          {children}
        </table>
      </div>
    ),

    thead: ({
      children,
    }) => (
      <thead className="border-b border-[var(--card-border)]/50 bg-[var(--accent)]/5">
        {children}
      </thead>
    ),

    th: ({
      children,
    }) => (
      <th className="px-3 py-2 text-left font-semibold text-[var(--foreground)]">
        {children}
      </th>
    ),

    td: ({
      children,
    }) => (
      <td className="border-t border-[var(--card-border)]/30 px-3 py-2 text-[var(--foreground)]/90">
        {children}
      </td>
    ),
  };

export function FormattedAiMarkdown({
  content,
  className,
}: {
  content:
    string;
  streaming?:
    boolean;
  className?:
    string;
}) {
  return (
    <div
      className={joinClasses(
        'xv-formatted-response space-y-3 text-[14px] leading-relaxed sm:text-[15px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
        ]}
        skipHtml
        urlTransform={
          safeMarkdownUrl
        }
        components={
          components
        }
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
