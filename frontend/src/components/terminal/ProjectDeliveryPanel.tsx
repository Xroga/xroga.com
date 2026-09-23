'use client';

import Link from 'next/link';

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Rocket,
} from 'lucide-react';

import {
  GitHubIcon,
} from '@/components/icons/GitHubIcon';

import {
  useLiveBuildStore,
} from '@/store/useLiveBuildStore';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  projectDeliveryApi,
  type ProjectDeliveryEnvelope,
} from '@/lib/projectDeliveryApi';

import {
  useProjectWorkspaceStore,
} from '@/store/useProjectWorkspaceStore';

export function ProjectDeliveryPanel() {
  const workspaceProjectId =
  useProjectWorkspaceStore(
    (
      state,
    ) =>
      state.projectId,
  );

const runtimeProjectId =
  useLiveBuildStore(
    (
      state,
    ) =>
      state.preview
        ?.projectId ??
      null,
  );

const projectId =
  workspaceProjectId ??
  runtimeProjectId;

  const repo =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.repo,
    );

  const branch =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.branch,
    );

  const applyDelivery =
    useProjectWorkspaceStore(
      (
        state,
      ) =>
        state.applyDelivery,
    );

  const [
    envelope,
    setEnvelope,
  ] =
    useState<
      ProjectDeliveryEnvelope |
      null
    >(
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      | 'status'
      | 'download'
      | 'publish'
      | 'deploy'
      | null
    >(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const refresh =
    useCallback(
      async () => {
        if (
          !projectId
        ) {
          return;
        }

        setBusy(
          'status',
        );

        setError(
          null,
        );

        try {
          const next =
            await projectDeliveryApi
              .status(
                projectId,
              );

          setEnvelope(
            next,
          );

          applyDelivery({
            repo:
              next.evidence
                .publication
                ?.repository ??
              undefined,

            branch:
              next.evidence
                .publication
                ?.branch ??
              undefined,

            githubRepoUrl:
              next.evidence
                .publication
                ?.repoUrl ??
              undefined,

            commitSha:
              next.evidence
                .publication
                ?.commitSha ??
              undefined,

            deployUrl:
              next.evidence
                .deployment
                ?.url ??
              undefined,
          });
        } catch (
          value
        ) {
          setError(
            value instanceof
              Error
              ? value.message
              : 'Delivery status could not be loaded.',
          );
        } finally {
          setBusy(
            null,
          );
        }
      },

      [
        projectId,
        applyDelivery,
      ],
    );

  useEffect(
    () => {
      void refresh();
    },

    [
      refresh,
    ],
  );

  if (
    !projectId
  ) {
    return (
      <div className="space-y-2 text-xs">
        <p className="font-semibold">
          Delivery
        </p>

        <p className="text-[var(--muted)]">
          Delivery controls become available after Xroga saves the canonical project.
        </p>
      </div>
    );
  }

  const delivery =
    envelope
      ?.delivery;

  const verified =
    delivery
      ?.verification
      .verified ===
    true;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <div>
          <p className="font-semibold">
            Delivery
          </p>

          <p className="text-[10px] text-[var(--muted)]">
            Xroga project, source ZIP, GitHub and deployment are separate delivery channels.
          </p>
        </div>

        {busy ===
        'status' ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[var(--muted)]" />
        ) : delivery
            ?.status ===
            'ready' ? (
          <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
        ) : null}
      </div>

      {error ? (
        <div className="flex gap-2 rounded-lg border border-rose-500/25 bg-rose-500/5 p-2 text-rose-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

          <span>
            {error}
          </span>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--card-border)]/50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              Xroga project
            </p>

            <p className="text-[10px] text-[var(--muted)]">
              {delivery
                ?.savedProject
                .status ===
                'ready'
                ? `${delivery.savedProject.fileCount} files saved`
                : 'Project workspace is not ready'}
            </p>
          </div>

          <span className="text-[10px] font-semibold text-emerald-500">
            {delivery
              ?.savedProject
              .status ??
              'loading'}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--card-border)]/50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              Source package
            </p>

            <p className="text-[10px] text-[var(--muted)]">
              Full current source project. Works for web, APIs, CLI, extensions, mobile, desktop and tools.
            </p>
          </div>

          <button
            type="button"
            disabled={
              busy !==
                null ||
              delivery
                ?.archive
                .status !==
                'ready'
            }
            onClick={
              async () => {
                setBusy(
                  'download',
                );

                setError(
                  null,
                );

                try {
                  await projectDeliveryApi
                    .download(
                      projectId,
                    );
                } catch (
                  value
                ) {
                  setError(
                    value instanceof
                      Error
                      ? value.message
                      : 'Project download failed.',
                  );
                } finally {
                  setBusy(
                    null,
                  );
                }
              }
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--card-border)] px-2 py-1.5 font-semibold hover:bg-[var(--foreground)]/5 disabled:opacity-40"
          >
            {busy ===
            'download' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}

            Download ZIP
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--card-border)]/50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              GitHub
            </p>

            <p className="text-[10px] text-[var(--muted)]">
              Optional. Publishes the verified current workspace to your authorized repository.
            </p>
          </div>

          {envelope
            ?.integrations
            .github
            .connected ? (
            <button
              type="button"
              disabled={
                busy !==
                  null ||
                !verified
              }
              onClick={
                async () => {
                  setBusy(
                    'publish',
                  );

                  setError(
                    null,
                  );

                  try {
                    const next =
                      await projectDeliveryApi
                        .publish(
                          projectId,

                          {
                            ...(
                              repo
                                ? {
                                    repository:
                                      repo,
                                  }
                                : {}
                            ),

                            branch:
                              branch ||
                              'main',

                            /*
                             * Existing default/protected branches remain protected.
                             * The backend may create a review branch/PR instead.
                             */
                            directWriteAuthorized:
                              false,

                            visibility:
                              'private',
                          },
                        );

                    setEnvelope(
                      next,
                    );

                    applyDelivery({
                      repo:
                        next.evidence
                          .publication
                          ?.repository ??
                        undefined,

                      branch:
                        next.evidence
                          .publication
                          ?.branch ??
                        undefined,

                      githubRepoUrl:
                        next.evidence
                          .publication
                          ?.repoUrl ??
                        undefined,

                      commitSha:
                        next.evidence
                          .publication
                          ?.commitSha ??
                        undefined,

                      status:
                        'pushed',
                    });
                  } catch (
                    value
                  ) {
                    setError(
                      value instanceof
                        Error
                        ? value.message
                        : 'GitHub publication failed.',
                    );
                  } finally {
                    setBusy(
                      null,
                    );
                  }
                }
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--card-border)] px-2 py-1.5 font-semibold hover:bg-[var(--foreground)]/5 disabled:opacity-40"
            >
              {busy ===
              'publish' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitHubIcon className="h-3.5 w-3.5" />
              )}

              {delivery
                ?.publication
                .status ===
                'ready'
                ? 'Publish update'
                : 'Publish'}
            </button>
          ) : (
            <Link
              href="/dashboard/integrations"
              className="font-semibold text-[var(--accent)]"
            >
              Connect GitHub
            </Link>
          )}
        </div>

        {!verified ? (
          <p className="text-[10px] text-amber-500">
            External publication unlocks after deterministic verification passes.
          </p>
        ) : null}

        {delivery
          ?.publication
          .repository ? (
          <div className="text-[10px] text-[var(--muted)]">
            <span>
              {delivery.publication.repository}
            </span>

            {delivery
              .publication
              .commitSha ? (
              <span>
                {' · '}
                {delivery.publication.commitSha.slice(
                  0,
                  8,
                )}
              </span>
            ) : null}

            {envelope
              ?.evidence
              .publication
              ?.repoUrl ? (
              <>
                {' · '}

                <a
                  href={
                    envelope.evidence
                      .publication
                      .repoUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent)]"
                >
                  Open
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            ) : null}
          </div>
        ) : null}

        {envelope
          ?.evidence
          .publication
          ?.pullRequestUrl ? (
          <a
            href={
              envelope.evidence
                .publication
                .pullRequestUrl
            }
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-semibold text-[var(--accent)]"
          >
            Review pull request →
          </a>
        ) : null}
      </div>

      <div className="rounded-lg border border-[var(--card-border)]/50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              Vercel
            </p>

            <p className="text-[10px] text-[var(--muted)]">
              Optional. Deploys directly from the canonical Xroga workspace. GitHub is not required.
            </p>
          </div>

          {envelope
            ?.integrations
            .vercel
            .connected ? (
            <button
              type="button"
              disabled={
                busy !==
                  null ||
                !verified
              }
              onClick={
                async () => {
                  setBusy(
                    'deploy',
                  );

                  setError(
                    null,
                  );

                  try {
                    const next =
                      await projectDeliveryApi
                        .deploy(
                          projectId,
                        );

                    setEnvelope(
                      next,
                    );

                    applyDelivery({
                      deployUrl:
                        next.evidence
                          .deployment
                          ?.url ??
                        undefined,

                      status:
                        'live',
                    });
                  } catch (
                    value
                  ) {
                    setError(
                      value instanceof
                        Error
                        ? value.message
                        : 'Vercel deployment failed.',
                    );
                  } finally {
                    setBusy(
                      null,
                    );
                  }
                }
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-[#006aff] px-2 py-1.5 font-semibold text-white disabled:opacity-40"
            >
              {busy ===
              'deploy' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}

              {delivery
                ?.deployment
                .status ===
                'ready'
                ? 'Redeploy'
                : 'Deploy'}
            </button>
          ) : (
            <Link
              href="/dashboard/integrations"
              className="font-semibold text-[var(--accent)]"
            >
              Connect Vercel
            </Link>
          )}
        </div>

        {delivery
          ?.deployment
          .url ? (
          <a
            href={
              delivery
                .deployment
                .url
            }
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)]"
          >
            {delivery.deployment.url.replace(
              /^https?:\/\//,
              '',
            )}

            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}

        {delivery
          ?.deployment
          .reason ? (
          <p className="text-[10px] text-amber-500">
            {delivery.deployment.reason}
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-[var(--foreground)]/[0.03] p-2 text-[10px] text-[var(--muted)]">
        Overall delivery: <strong>{delivery?.status ?? 'loading'}</strong>.
        GitHub or Vercel failure never deletes the saved Xroga project or its downloadable source package.
      </div>
    </div>
  );
}
