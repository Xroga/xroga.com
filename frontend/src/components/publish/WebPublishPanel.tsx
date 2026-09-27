'use client';

import Link from 'next/link';
import { ArrowRight, Check, Copy, ExternalLink, Globe2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { CustomDomainPanel } from '@/components/publish/CustomDomainPanel';
import {
  PublishDisclosure,
  PublishError,
  PublishRequirement,
  PublishStatusBadge,
} from '@/components/publish/PublishPrimitives';
import type {
  GitHubPublishStatus,
  PublishProject,
  PublishStatus,
  SupabasePublishStatus,
  VercelPublishStatus,
} from '@/lib/publish/types';

export function WebPublishPanel({
  status,
  github,
  vercel,
  supabase,
  project,
  preferredVercelProject,
  onStartWorkspace,
  onRetry,
  statusError,
}: {
  status?: PublishStatus['web'];
  github?: GitHubPublishStatus | null;
  vercel?: VercelPublishStatus | null;
  supabase?: SupabasePublishStatus | null;
  project?: PublishProject | null;
  preferredVercelProject?: string | null;
  onStartWorkspace: (prompt: string) => void;
  onRetry: () => void;
  statusError?: string | null;
}) {
  if (statusError && !status) {
    return (
      <PublishError
        title="Web publishing status is unavailable"
        body={statusError}
        onRetry={onRetry}
      />
    );
  }

  const githubConnected = Boolean(
    github?.connected ?? status?.githubConnected ?? status?.checklist.find((item) => item.id === 'github')?.done,
  );
  const managedVercel = Boolean(vercel?.managedDeployAvailable ?? status?.managedVercelAvailable);
  const userVercelReady = Boolean(
    vercel?.connected &&
      vercel?.tokenValid !== false &&
      vercel?.canDeploy !== false,
  );
  const fallbackVercelConnected = Boolean(
    status?.vercelConnected ?? status?.checklist.find((item) => item.id === 'vercel')?.done,
  );
  const vercelReady = managedVercel || userVercelReady || (!vercel && fallbackVercelConnected);
  const supabaseReady = Boolean(
    supabase?.ready ||
      supabase?.connected ||
      supabase?.provisioned ||
      status?.checklist.find((item) => item.id === 'supabase')?.done,
  );
  const ready = githubConnected && vercelReady;

  const requirements = [
    {
      id: 'github',
      label: 'GitHub',
      done: githubConnected,
      required: true,
      hint: 'Required for source code and project history.',
      pluginId: 'github',
    },
    {
      id: 'vercel',
      label: 'Vercel',
      done: vercelReady,
      required: true,
      hint: managedVercel
        ? 'Xroga-managed publishing is available for this account.'
        : vercel?.connected && vercel?.canDeploy === false
          ? 'Connected, but this authorization cannot deploy. Re-authorize or use managed publishing when available.'
          : userVercelReady
            ? `Your Vercel account${vercel?.username ? ` (@${vercel.username})` : ''} is ready for deployment.`
            : 'Required for web deployment.',
      pluginId: 'vercel',
    },
    {
      id: 'supabase',
      label: 'Supabase',
      done: supabaseReady,
      required: false,
      hint: 'Optional for static sites. Use it when the project needs database, auth or storage.',
      pluginId: 'supabase',
    },
  ];

  const projectLabel = project
    ? project.githubRepoName
      ? `${project.name} (${project.githubRepoName})`
      : project.name
    : 'the current project';

  return (
    <div className="space-y-5">
      <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Globe2 className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Web</h2>
              <PublishStatusBadge
                label={ready ? 'Ready' : 'Setup required'}
                tone={ready ? 'success' : 'warning'}
              />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Publish a verified web project through GitHub and the available Vercel deployment path.
            </p>
          </div>

          <button
            type="button"
            disabled={!ready}
            onClick={() =>
              onStartWorkspace(
                `Build, verify, and publish ${projectLabel} as a production web app. Use the connected GitHub repository and configured Vercel publishing path. Report the real production URL only after deployment verification.`,
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {ready ? 'Publish from Workspace' : 'Resolve setup first'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 border-t border-[var(--border-subtle)]">
          {requirements.map((item) => (
            <PublishRequirement
              key={item.id}
              item={item}
              pluginId={item.pluginId}
              actionLabel={item.id === 'supabase' ? 'Open Plugin' : 'Connect'}
            />
          ))}
        </div>

        {vercel?.warning ? (
          <div className="mt-4 rounded-token-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--text-secondary)]">
            {vercel.warning}
          </div>
        ) : null}
      </section>

      {project?.deployUrl ? (
        <section className="rounded-token-lg border border-emerald-500/25 bg-emerald-500/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Production URL
              </p>
              <p className="mt-1 break-all text-sm text-[var(--text-secondary)]">{project.deployUrl}</p>
              {project.branch ? (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Branch: {project.branch}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(project.deployUrl!);
                  toast.success('URL copied');
                }}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy URL
              </button>
              <a
                href={project.deployUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                Open site
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">No verified web deployment shown yet</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Xroga will only show a production URL here when a real project record contains one. Use Workspace to build and publish.
          </p>
        </section>
      )}

      <PublishDisclosure
        title="Custom domain"
        description="Attach and verify a domain on your Vercel project."
      >
        {vercel?.connected ? (
          <CustomDomainPanel initialProject={preferredVercelProject ?? undefined} />
        ) : managedVercel ? (
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            Custom-domain management currently uses your authorized Vercel account. Connect Vercel from the Plugin page to manage domains directly.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-[var(--text-secondary)]">
              Connect Vercel before managing a custom domain.
            </p>
            <Link
              href="/dashboard/integrations/vercel"
              className="inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
            >
              Open Vercel Plugin
            </Link>
          </div>
        )}
      </PublishDisclosure>

      <PublishDisclosure
        title="Configuration"
        description="Project and provider configuration used by this target."
      >
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">Repository</dt>
            <dd className="mt-1 font-medium text-[var(--text-primary)]">
              {project?.githubRepoName || 'Choose a project above'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Hosting</dt>
            <dd className="mt-1 font-medium text-[var(--text-primary)]">
              {managedVercel
                ? 'Xroga-managed Vercel'
                : userVercelReady
                  ? 'Your Vercel account'
                  : 'Not ready'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Backend</dt>
            <dd className="mt-1 font-medium text-[var(--text-primary)]">
              {supabaseReady ? 'Supabase connected' : 'Optional / not configured'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Environment secrets</dt>
            <dd className="mt-1">
              <Link href="/dashboard/integrations?view=custom" className="font-semibold text-[var(--accent)] hover:underline">
                Manage in Plugins
              </Link>
            </dd>
          </div>
        </dl>
      </PublishDisclosure>
    </div>
  );
}