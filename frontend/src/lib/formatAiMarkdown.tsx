'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { SourceLogo } from '@/components/terminal/SourceLogo';

import ReactMarkdown, {
  type Components,
  type UrlTransform,
} from 'react-markdown';

import remarkGfm from 'remark-gfm';
import { remarkSourceCitations, safeSourceUrl, type CitationSource } from './xrogaCitations';

import {
  ApiError,
  api,
  apiFetch,
} from './api';

import {
  clearOAuthResult,
  subscribeOAuthResults,
} from './oauthPopupResult';

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


interface ToolUiConnectionCandidate {
  toolkit: string;
  name: string;
  description?: string;
  logo?: string;
  recommended: boolean;
}

type ToolUiDescriptor =
  | {
      version: 1;
      type:
        | 'connection_required'
        | 'provider_choice';
      mode:
        | 'read'
        | 'action';
      task: string;
      title: string;
      message: string;
      candidates:
        ToolUiConnectionCandidate[];
    }
  | {
      version: 1;
      type:
        'confirmation_required';
      task: string;
      title: string;
      message: string;
      confirmationId: string;
      summary: string;
      toolkit: string;
      risk: string;
      expiresAt: string;
    };

function decodeBase64UrlUtf8(
  value: string,
): string {
  const normalized =
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/');

  const padded =
    normalized.padEnd(
      normalized.length +
        ((4 -
          (normalized.length % 4)) %
          4),
      '=',
    );

  const binary =
    window.atob(
      padded,
    );

  const bytes =
    Uint8Array.from(
      binary,
      (character) =>
        character.charCodeAt(
          0,
        ),
    );

  return new TextDecoder()
    .decode(
      bytes,
    );
}

function toolUiFromHref(
  href:
    string |
    undefined,
): ToolUiDescriptor | null {
  if (
    !href ||
    typeof window ===
      'undefined'
  ) {
    return null;
  }

  try {
    const parsed =
      new URL(
        href,
        window.location.origin,
      );

    if (
      parsed.pathname !==
      '/xroga/tool-ui'
    ) {
      return null;
    }

    const encoded =
      parsed.searchParams.get(
        'payload',
      );

    if (
      !encoded ||
      encoded.length >
        32_000
    ) {
      return null;
    }

    const value =
      JSON.parse(
        decodeBase64UrlUtf8(
          encoded,
        ),
      ) as unknown;

    if (
      !value ||
      typeof value !==
        'object' ||
      Array.isArray(
        value,
      )
    ) {
      return null;
    }

    const descriptor =
      value as Partial<
        ToolUiDescriptor
      >;

    if (
      descriptor.version !==
      1 ||
      typeof descriptor.type !==
        'string'
    ) {
      return null;
    }

    if (
      descriptor.type ===
        'confirmation_required'
    ) {
      return typeof (
        descriptor as {
          confirmationId?:
            unknown;
        }
      ).confirmationId ===
        'string'
        ? descriptor as ToolUiDescriptor
        : null;
    }

    if (
      descriptor.type !==
        'connection_required' &&
      descriptor.type !==
        'provider_choice'
    ) {
      return null;
    }

    const candidates =
      (
        descriptor as {
          candidates?:
            unknown;
        }
      ).candidates;

    if (
      !Array.isArray(
        candidates,
      ) ||
      candidates.length <
        1 ||
      candidates.length >
        5
    ) {
      return null;
    }

    return descriptor as
      ToolUiDescriptor;
  } catch {
    return null;
  }
}

function toolUiFromMarkdownContent(
  content: string,
): {
  descriptor:
    ToolUiDescriptor;
  visibleText:
    string;
} | null {
  const match =
    content.match(
      /\[[^\]]*\]\((\/xroga\/tool-ui\?payload=[^)\s]+)\)/,
    );

  if (
    !match?.[1]
  ) {
    return null;
  }

  const descriptor =
    toolUiFromHref(
      match[1],
    );

  if (
    !descriptor
  ) {
    return null;
  }

  return {
    descriptor,
    visibleText:
      content
        .replace(
          match[0],
          '',
        )
        .trim(),
  };
}

function AppMark({
  candidate,
}: {
  candidate:
    ToolUiConnectionCandidate;
}) {
  const [
    imageFailed,
    setImageFailed,
  ] =
    useState(
      false,
    );

  const initials =
    candidate.name
      .split(/\s+/g)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]
            ?.toUpperCase() ??
          '',
      )
      .join('');

  if (
    candidate.logo &&
    !imageFailed
  ) {
    return (
      <img
        src={candidate.logo}
        alt=""
        className="h-10 w-10 rounded-xl border border-[var(--card-border)]/60 bg-white object-contain p-1.5"
        onError={() =>
          setImageFailed(
            true,
          )
        }
      />
    );
  }

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)]/60 bg-[var(--accent)]/10 text-xs font-bold tracking-wide text-[var(--accent)]">
      {initials ||
        'APP'}
    </span>
  );
}

function XrogaConnectionCard({
  descriptor,
}: {
  descriptor: Extract<
    ToolUiDescriptor,
    {
      type:
        | 'connection_required'
        | 'provider_choice';
    }
  >;
}) {
  const [
    connectingToolkit,
    setConnectingToolkit,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const [
    connectedToolkit,
    setConnectedToolkit,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const [
    continuing,
    setContinuing,
  ] =
    useState(
      false,
    );

  const [
    continuation,
    setContinuation,
  ] =
    useState<
      string |
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

  const selectedCandidate =
    descriptor.candidates.find(
      (candidate) =>
        candidate.toolkit ===
        connectingToolkit,
    ) ??
    descriptor.candidates.find(
      (candidate) =>
        candidate.toolkit ===
        connectedToolkit,
    );

  const continueOriginalTask =
    useCallback(
      async (
        candidate:
          ToolUiConnectionCandidate,
      ) => {
        setContinuing(
          true,
        );

        setNotice(
          null,
        );

        try {
          const providerBoundTask =
            `${descriptor.task}\n\nUse ${candidate.name} for this request.`;

          const plan =
            await api.phase1.plan(
              providerBoundTask,
            );

          if (
            plan.directResponse
          ) {
            setContinuation(
              plan.directResponse,
            );
            return;
          }

          if (
            plan.dispatch ===
            'blocked'
          ) {
            setContinuation(
              plan.blockers.length
                ? `Xroga still needs attention before continuing: ${plan.blockers.join(' · ')}`
                : 'Xroga could not continue this request after connection.',
            );
            return;
          }

          if (
            plan.dispatch !==
            'chat'
          ) {
            setContinuation(
              'Connected successfully. Continue this request from the workspace composer.',
            );
            return;
          }

          const result =
            await api.phase1.chat(
              providerBoundTask,
              undefined,
              undefined,
              plan.goalContract,
            );

          setContinuation(
            result.response,
          );
        } catch (
          error
        ) {
          setNotice(
            error instanceof
              Error
              ? error.message
              : 'Connected, but Xroga could not continue the task automatically.',
          );
        } finally {
          setContinuing(
            false,
          );
        }
      },
      [
        descriptor.task,
      ],
    );

  useEffect(
    () =>
      subscribeOAuthResults(
        (payload) => {
          if (
            payload.type ===
              'xroga-composio-connected' &&
            connectingToolkit &&
            selectedCandidate
          ) {
            setConnectedToolkit(
              connectingToolkit,
            );

            setConnectingToolkit(
              null,
            );

            setNotice(
              `${selectedCandidate.name} connected. Continuing your request…`,
            );

            void continueOriginalTask(
              selectedCandidate,
            );
          }

          if (
            payload.type ===
              'xroga-composio-error' &&
            connectingToolkit
          ) {
            setConnectingToolkit(
              null,
            );

            setNotice(
              payload.message ||
                'The app connection could not be completed.',
            );
          }
        },
      ),
    [
      connectingToolkit,
      continueOriginalTask,
      selectedCandidate,
    ],
  );

  const connect =
    useCallback(
      async (
        candidate:
          ToolUiConnectionCandidate,
      ) => {
        if (
          connectingToolkit ||
          continuing
        ) {
          return;
        }

        clearOAuthResult();

        const popup =
          window.open(
            '',
            'xroga-connect-oauth',
            'width=600,height=760,resizable=yes,scrollbars=yes',
          );

        if (
          !popup
        ) {
          setNotice(
            'Allow pop-ups for Xroga so the secure authorization window can open.',
          );
          return;
        }

        setConnectingToolkit(
          candidate.toolkit,
        );

        setNotice(
          null,
        );

        try {
          const link =
            await apiFetch<{
              ok: boolean;
              toolkit: string;
              redirectUrl: string;
            }>(
              `/api/phase1/business-apps/${encodeURIComponent(
                candidate.toolkit,
              )}/connect-link`,
              {
                method:
                  'POST',

                body:
                  JSON.stringify(
                    {
                      mode:
                        descriptor.mode,
                    },
                  ),
              },
            );

          popup.location.href =
            link.redirectUrl;

          popup.focus();
        } catch (
          error
        ) {
          try {
            popup.close();
          } catch {
            // Ignore.
          }

          setConnectingToolkit(
            null,
          );

          setNotice(
            error instanceof
              Error
              ? error.message
              : 'Xroga could not start authorization for this app.',
          );
        }
      },
      [
        connectingToolkit,
        continuing,
        descriptor.mode,
      ],
    );

  const continuationUi =
    continuation
      ? toolUiFromMarkdownContent(
          continuation,
        )
      : null;

  return (
    <span className="my-2 flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--foreground)]/[0.025] p-3.5 align-top shadow-sm">
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-[13px] font-semibold text-[var(--foreground)]">
            {descriptor.title}
          </span>

          <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--foreground)]/65">
            {descriptor.message}
          </span>
        </span>

        <span className="shrink-0 rounded-full border border-[var(--card-border)]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]/50">
          Xroga Connect
        </span>
      </span>

      <span className="flex flex-col gap-2">
        {descriptor.candidates.map(
          (candidate) => {
            const connecting =
              connectingToolkit ===
              candidate.toolkit;

            const connected =
              connectedToolkit ===
              candidate.toolkit;

            return (
              <span
                key={candidate.toolkit}
                className="flex items-center gap-3 rounded-xl border border-[var(--card-border)]/55 bg-[var(--foreground)]/[0.02] p-2.5"
              >
                <AppMark
                  candidate={
                    candidate
                  }
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-[var(--foreground)]">
                      {candidate.name}
                    </span>

                    {candidate.recommended &&
                    descriptor.candidates.length >
                      1 ? (
                      <span className="rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                        Recommended
                      </span>
                    ) : null}
                  </span>

                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-[var(--foreground)]/55">
                    {candidate.description ||
                      (
                        descriptor.mode ===
                        'read'
                          ? 'Connect this app so Xroga can read the information needed for your request.'
                          : 'Connect this app so Xroga can perform the exact action you requested.'
                      )}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    connect(
                      candidate,
                    )
                  }
                  disabled={
                    Boolean(
                      connectingToolkit,
                    ) ||
                    continuing ||
                    connected
                  }
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connected
                    ? 'Connected'
                    : connecting
                      ? 'Connecting…'
                      : 'Connect'}
                </button>
              </span>
            );
          },
        )}
      </span>

      <span className="rounded-lg bg-[var(--foreground)]/[0.025] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--foreground)]/50">
        {descriptor.mode ===
        'read'
          ? 'Xroga will use this connection only to retrieve data needed for the request.'
          : 'Xroga may perform the exact action you requested. Destructive, financial, and permission-changing actions still require a separate confirmation.'}
      </span>

      {notice ? (
        <span className="text-[11px] font-medium text-[var(--foreground)]/65">
          {notice}
        </span>
      ) : null}

      {continuing ? (
        <span className="text-[11px] font-medium text-[var(--accent)]">
          Continuing your original request…
        </span>
      ) : null}

      {continuation ? (
        <span className="flex flex-col gap-2 rounded-xl border border-[var(--card-border)]/50 bg-[var(--foreground)]/[0.02] p-3">
          {(
            continuationUi
              ?.visibleText ||
            continuation
          ) ? (
            <span className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--foreground)]/80">
              {continuationUi
                ?.visibleText ||
                continuation}
            </span>
          ) : null}

          {continuationUi
            ?.descriptor
            .type ===
          'confirmation_required' ? (
            <BusinessActionConfirmationInline
              confirmationId={
                continuationUi
                  .descriptor
                  .confirmationId
              }
            />
          ) : null}
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
      <h2 className="xv-answer-title text-[var(--foreground)]">
        {children}
      </h2>
    ),

    h2: ({
      children,
    }) => (
      <h3 className="xv-answer-section text-[var(--foreground)]">
        {children}
      </h3>
    ),

    h3: ({
      children,
    }) => (
      <h4 className="xv-answer-subsection text-[var(--foreground)]">
        {children}
      </h4>
    ),

    h4: ({
      children,
    }) => (
      <h5 className="xv-answer-subsection text-[var(--foreground)]">
        {children}
      </h5>
    ),

    p: ({
      children,
    }) => (
      <p className="xv-answer-paragraph text-[var(--foreground)]/90">
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
      const toolUi =
        toolUiFromHref(
          href,
        );

      if (
        toolUi?.type ===
          'connection_required' ||
        toolUi?.type ===
          'provider_choice'
      ) {
        return (
          <XrogaConnectionCard
            descriptor={
              toolUi
            }
          />
        );
      }

      if (
        toolUi?.type ===
        'confirmation_required'
      ) {
        return (
          <BusinessActionConfirmationInline
            confirmationId={
              toolUi.confirmationId
            }
          />
        );
      }

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
      <ul className="xv-answer-list list-disc pl-5">
        {children}
      </ul>
    ),

    ol: ({
      children,
    }) => (
      <ol className="xv-answer-list list-decimal pl-5">
        {children}
      </ol>
    ),

    li: ({
      children,
    }) => (
      <li className="pl-0.5 text-[var(--foreground)]/90">
        {children}
      </li>
    ),

    blockquote: ({
      children,
    }) => (
      <blockquote className="xv-answer-quote px-4 py-2 text-[var(--foreground)]/85">
        {children}
      </blockquote>
    ),

    hr: () => (
      <hr className="xv-answer-divider" />
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

function CitationChip({ number, source, label }: { number?: number; source: CitationSource; label?: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const linkRef = useRef<HTMLAnchorElement>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (dismissRef.current) clearTimeout(dismissRef.current); }, []);
  const url = safeSourceUrl(source.url);
  if (!url) return <span>{label ?? `[${number}]`}</span>;
  const domain = new URL(url).hostname.replace(/^www\./i, '');
  const snippet = source.snippet.replace(/\s+/g, ' ').replace(/^[\s*•-]+/, '').trim();
  const excerpt = snippet.length > 175 ? `${snippet.slice(0, 172).trimEnd()}…` : snippet;
  const keepOpen = () => { if (dismissRef.current) clearTimeout(dismissRef.current); };
  const scheduleClose = () => { keepOpen(); dismissRef.current = setTimeout(() => setVisible(false), 180); };
  const placePreview = () => {
    keepOpen();
    const rect = linkRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(344, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = rect.bottom + 12 + 260 < window.innerHeight ? rect.bottom + 9 : Math.max(12, rect.top - 260);
    setPosition({ top, left });
    setVisible(true);
  };
  return (
    <span className="inline-flex align-baseline">
      <a
        ref={linkRef}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={number ? `Open source ${number}: ${source.title}` : `Open link: ${source.title}`}
        onMouseEnter={placePreview}
        onMouseLeave={scheduleClose}
        onFocus={placePreview}
        onBlur={scheduleClose}
        onKeyDown={(event) => { if (event.key === 'Escape') setVisible(false); }}
        className={label ? 'xv-resource-link' : 'xv-citation-chip'}
      >{label ?? <><SourceLogo domain={domain} size={15} /><span>{domain}</span></>}</a>
      {visible && typeof document !== 'undefined' ? createPortal(
        <div className="xv-citation-preview" style={{ top: position.top, left: position.left }} onMouseEnter={keepOpen} onMouseLeave={scheduleClose} onFocus={keepOpen} onBlur={scheduleClose}>
          <span className="xv-citation-preview__top"><span className="xv-citation-preview__icon"><SourceLogo domain={domain} size={27} /></span><span className="min-w-0"><span className="xv-citation-preview__domain">{domain}</span><span className="xv-citation-preview__eyebrow">Source page · verify on original site</span></span></span>
          <span className="xv-citation-preview__title">{source.title}</span>
          {excerpt ? <span className="xv-citation-preview__excerpt">{excerpt}</span> : null}
          <span className="xv-citation-preview__actions"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(snippet || source.title); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy excerpt'}</button><a href={url} target="_blank" rel="noopener noreferrer">Visit source <ArrowUpRight size={13} /></a></span>
        </div>, document.body,
      ) : null}
    </span>
  );
}

/** Add breathing room to legacy wall-of-text answers without rewriting their wording. */
export function structureLongProse(markdown: string): string {
  const formatBlock = (block: string) => {
    const prose = block.trim();
    if (prose.length < 440 || prose.includes('\n') || /^(?:[#>*+`~|-]|\d+[.)]\s|!\[|<)/.test(prose)) return block;
    const sentences = prose.split(/(?<=[.!?])\s+(?=(?:\*\*)?[A-Z(])/);
    if (sentences.length < 3) return block;
    const paragraphs: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length >= 260 && current.length + sentence.length > 370) {
        paragraphs.push(current);
        current = sentence;
      } else {
        current += `${current ? ' ' : ''}${sentence}`;
      }
    }
    if (current) paragraphs.push(current);
    return paragraphs.join('\n\n');
  };
  return markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g).map((segment, index) => index % 2
    ? segment
    : segment.split(/(\n\s*\n)/).map(formatBlock).join('')).join('');
}

export function FormattedAiMarkdown({
  content,
  className,
  sources,
  streaming,
  afterIntro,
}: {
  content:
    string;
  streaming?:
    boolean;
  className?:
    string;
  sources?: CitationSource[];
  afterIntro?: React.ReactNode;
}) {
  const normalized = streaming ? content.replace(/\r\n/g, '\n') : structureLongProse(content.replace(/\r\n/g, '\n'));
  const opening = normalized.match(/^([^\n]+(?:\n(?!\n)[^\n]+)*)\n\s*\n/);
  const lead = !streaming && (normalized.length > 500 || afterIntro) && opening && opening[1].length >= 25 && opening[1].length <= 500 && !/^\s*(?:[#>*`\-|\d+\.]|!\[)/.test(opening[1]) ? opening[1] : null;
  const introParts = afterIntro && !lead && !streaming ? normalized.split(/\n\s*\n/) : [];
  const introCount = introParts.length > 1 && /^#{1,2}\s/.test(introParts[0]) && !/^(?:[#>*`\-|\d+\.]|!\[)/.test(introParts[1]) ? 2 : introParts.length > 1 && !/^(?:[#>*`\-|\d+\.]|!\[)/.test(introParts[0]) ? 1 : 0;
  const introMarkdown = introCount ? introParts.slice(0, introCount).join('\n\n') : null;
  const remaining = lead ? normalized.slice(opening![0].length) : introMarkdown ? introParts.slice(introCount).join('\n\n') : normalized;
  const availableSources = sources ?? [];
  const sourceComponents: Components = {
    ...components,
    a: ({ href, children, ...props }) => {
      const label = Array.isArray(children) ? children.join('') : children;
      const match = typeof label === 'string' ? /^\[(\d{1,2})\]$/.exec(label) : null;
      const number = match ? Number(match[1]) : 0;
      const source = number > 0 ? availableSources[number - 1] : undefined;
      if (source && href === safeSourceUrl(source.url)) return <CitationChip number={number} source={source} />;
      const external = href ? safeSourceUrl(href) : null;
      if (external) {
        const knownIndex = availableSources.findIndex((item) => safeSourceUrl(item.url) === external);
        const title = typeof label === 'string' && label.trim() ? label.trim() : new URL(external).hostname;
        return <CitationChip number={knownIndex >= 0 ? knownIndex + 1 : undefined} source={knownIndex >= 0 ? availableSources[knownIndex] : { title, url: external, snippet: '' }} label={children} />;
      }
      return React.createElement(components.a as React.ElementType, { href, ...props }, children);
    },
  };
  return (
    <div
      className={joinClasses(
        'xv-formatted-response [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      {lead ? <div className="xv-answer-lead"><span className="xv-answer-lead__label">The short answer</span><ReactMarkdown remarkPlugins={[remarkGfm, ...(sources?.length ? [remarkSourceCitations(sources)] : [])]} skipHtml urlTransform={safeMarkdownUrl} components={sourceComponents}>{lead}</ReactMarkdown></div> : null}
      {introMarkdown ? <ReactMarkdown remarkPlugins={[remarkGfm, ...(sources?.length ? [remarkSourceCitations(sources)] : [])]} skipHtml urlTransform={safeMarkdownUrl} components={sourceComponents}>{introMarkdown}</ReactMarkdown> : null}
      {afterIntro && lead ? afterIntro : null}
      {afterIntro && !lead ? <div className="xv-answer-intro-card">{afterIntro}</div> : null}
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          ...(sources?.length ? [remarkSourceCitations(sources)] : []),
        ]}
        skipHtml
        urlTransform={
          safeMarkdownUrl
        }
        components={
          sourceComponents
        }
      >
        {remaining}
      </ReactMarkdown>
    </div>
  );
}
