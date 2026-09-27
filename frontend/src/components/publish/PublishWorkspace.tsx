'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  GitBranch,
  LockKeyhole,
  Rocket,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { ChromePublishPanel } from '@/components/publish/ChromePublishPanel';
import { DesktopPublishPanel } from '@/components/publish/DesktopPublishPanel';
import { MobilePublishPanel } from '@/components/publish/MobilePublishPanel';
import {
  PublishError,
  PublishLoading,
  PublishStatusBadge,
  PublishTargetTabs,
} from '@/components/publish/PublishPrimitives';
import { WebPublishPanel } from '@/components/publish/WebPublishPanel';
import { api, type Project } from '@/lib/api';
import type {
  GitHubPublishStatus,
  PublishProject,
  PublishStatus,
  PublishTarget,
  SupabasePublishStatus,
  VercelPublishStatus,
} from '@/lib/publish/types';
import { useAppStore } from '@/store/useAppStore';

function isPublishTarget(value: string | null): value is PublishTarget {
  return value === 'web' || value === 'chrome' || value === 'desktop' || value === 'mobile';
}

function projectContextFromProject(project: Project): PublishProject {
  const raw = project as Project & {
    deploy_url?: string | null;
    github_branch?: string | null;
  };

  return {
    id: project.id,
    name: project.name,
    githubRepoName: project.github_repo_name,
    githubRepoUrl: project.github_repo_url,
    branch: raw.github_branch ?? null,
    deployUrl: raw.deploy_url ?? null,
    updatedAt: project.updated_at,
  };
}

function enrichProject(
  project: PublishProject,
  detail: unknown,
): PublishProject {
  if (!detail || typeof detail !== 'object') return project;

  const value = detail as {
    github_repo_name?: string | null;
    github_repo_url?: string | null;
    github_branch?: string | null;
    deploy_url?: string | null;
    project_messages?: Array<{
      created_at?: string;
      metadata?: {
        deployUrl?: unknown;
        githubBranch?: unknown;
        githubRepoName?: unknown;
      };
    }>;
  };

  const messages = [...(value.project_messages ?? [])].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );

  const metadata = messages
    .map((message) => message.metadata)
    .find(
      (item) =>
        item &&
        (typeof item.deployUrl === 'string' ||
          typeof item.githubBranch === 'string' ||
          typeof item.githubRepoName === 'string'),
    );

  return {
    ...project,
    githubRepoName:
      value.github_repo_name ||
      (typeof metadata?.githubRepoName === 'string' ? metadata.githubRepoName : project.githubRepoName),
    githubRepoUrl: value.github_repo_url || project.githubRepoUrl,
    branch:
      value.github_branch ||
      (typeof metadata?.githubBranch === 'string' ? metadata.githubBranch : project.branch) ||
      'main',
    deployUrl:
      value.deploy_url ||
      (typeof metadata?.deployUrl === 'string' ? metadata.deployUrl : project.deployUrl),
  };
}

export function PublishWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setChatPrefill = useAppStore((state) => state.setChatPrefill);

  const [target, setTargetState] = useState<PublishTarget>('web');
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [github, setGithub] = useState<GitHubPublishStatus | null>(null);
  const [vercel, setVercel] = useState<VercelPublishStatus | null>(null);
  const [supabase, setSupabase] = useState<SupabasePublishStatus | null>(null);
  const [projects, setProjects] = useState<PublishProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectDetail, setProjectDetail] = useState<PublishProject | null>(null);
  const [preferredVercelProject, setPreferredVercelProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);

    const [publishResult, githubResult, vercelResult, supabaseResult, projectsResult] =
      await Promise.allSettled([
        api.publish.status(),
        api.github.status(),
        api.vercel.status(),
        api.supabase.status(),
        api.projects.list(),
      ]);

    if (publishResult.status === 'fulfilled') {
      setStatus(publishResult.value as PublishStatus);
      setPublishError(null);
    } else {
      setPublishError(
        publishResult.reason instanceof Error
          ? publishResult.reason.message
          : 'Could not load publish readiness.',
      );
    }

    const nextErrors: Record<string, string> = {};

    if (githubResult.status === 'fulfilled') {
      setGithub(githubResult.value as GitHubPublishStatus);
    } else {
      setGithub(null);
      nextErrors.github = 'GitHub status is temporarily unavailable.';
    }

    if (vercelResult.status === 'fulfilled') {
      setVercel(vercelResult.value as VercelPublishStatus);
    } else {
      setVercel(null);
      nextErrors.vercel = 'Vercel status is temporarily unavailable.';
    }

    if (supabaseResult.status === 'fulfilled') {
      setSupabase(supabaseResult.value as SupabasePublishStatus);
    } else {
      setSupabase(null);
      nextErrors.supabase = 'Supabase status is temporarily unavailable.';
    }

    if (projectsResult.status === 'fulfilled') {
      const normalized = (projectsResult.value as Project[]).map(projectContextFromProject);
      setProjects(normalized);
      setSelectedProjectId((current) => {
        const requested = searchParams.get('project');
        if (requested && normalized.some((project) => project.id === requested)) return requested;
        if (current && normalized.some((project) => project.id === current)) return current;
        return normalized.length === 1 ? normalized[0]!.id : '';
      });
    } else {
      nextErrors.projects = 'Projects are temporarily unavailable.';
    }

    setProviderErrors(nextErrors);
    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    const requestedTarget = searchParams.get('target');
    const legacyTab = searchParams.get('tab');
    const cws = searchParams.get('cws');

    if (isPublishTarget(requestedTarget)) {
      setTargetState(requestedTarget);
    } else if (isPublishTarget(legacyTab)) {
      setTargetState(legacyTab);
    } else if (cws) {
      setTargetState('chrome');
    } else {
      setTargetState('web');
    }
  }, [searchParams]);

  useEffect(() => {
    const cws = searchParams.get('cws');
    if (!cws) return;

    if (cws === 'connected') toast.success('Chrome Web Store connected');
    if (cws === 'error') toast.error(searchParams.get('message') || 'Chrome Web Store authorization failed');

    const params = new URLSearchParams(searchParams.toString());
    params.delete('cws');
    params.delete('message');
    params.delete('tab');
    params.set('target', 'chrome');
    router.replace(`/dashboard/publish?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    try {
      setPreferredVercelProject(localStorage.getItem('xroga_vercel_preferred_project'));
    } catch {
      setPreferredVercelProject(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null);
      return;
    }

    const base = projects.find((project) => project.id === selectedProjectId) ?? null;
    if (!base) {
      setProjectDetail(null);
      return;
    }

    let active = true;
    setProjectDetail(base);

    void api.projects
      .get(selectedProjectId)
      .then((detail) => {
        if (active) setProjectDetail(enrichProject(base, detail));
      })
      .catch(() => {
        if (active) setProjectDetail(base);
      });

    return () => {
      active = false;
    };
  }, [projects, selectedProjectId]);

  function setTarget(next: PublishTarget) {
    setTargetState(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('target', next);
    params.delete('tab');
    router.replace(`/dashboard/publish?${params.toString()}`, { scroll: false });
  }

  function selectProject(id: string) {
    setSelectedProjectId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('project', id);
    else params.delete('project');
    router.replace(
      params.toString() ? `/dashboard/publish?${params.toString()}` : '/dashboard/publish',
      { scroll: false },
    );
  }

  function startInWorkspace(prompt: string) {
    setChatPrefill(prompt);
    router.push('/workspace');
  }

  const webVercelReady = Boolean(
    vercel?.managedDeployAvailable ||
      (vercel?.connected && vercel?.tokenValid !== false && vercel?.canDeploy !== false) ||
      (!vercel && status?.web.vercelConnected),
  );
  const webGithubReady = Boolean(github?.connected ?? status?.web.githubConnected);
  const webReady = webGithubReady && webVercelReady;

  const chromeReady = Boolean(status?.chrome?.ready);
  const desktopReady = Boolean(status?.desktop?.ready);
  const mobileReady = Boolean(status?.mobile.ready);

  const targetStatuses = useMemo(
    () => ({
      web: {
        label: webReady ? 'Ready' : 'Setup',
        tone: webReady ? ('success' as const) : ('warning' as const),
      },
      chrome: {
        label: chromeReady ? 'Ready' : 'Setup',
        tone: chromeReady ? ('success' as const) : ('warning' as const),
      },
      desktop: {
        label: desktopReady ? 'Ready' : 'Setup',
        tone: desktopReady ? ('success' as const) : ('warning' as const),
      },
      mobile: {
        label: mobileReady ? 'Ready' : 'Setup',
        tone: mobileReady ? ('success' as const) : ('warning' as const),
      },
    }),
    [webReady, chromeReady, desktopReady, mobileReady],
  );

  const readyCount = [webReady, chromeReady, desktopReady, mobileReady].filter(Boolean).length;
  const selectedProject = projectDetail ?? projects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Rocket className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
              Publish
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Ship this project on infrastructure you control. Choose a target, resolve only what is missing, then publish.
          </p>
        </div>

        <PublishStatusBadge
          label={loading ? 'Checking readiness' : `${readyCount} of 4 targets ready`}
          tone={readyCount > 0 ? 'success' : 'neutral'}
        />
      </header>

      <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Project context</h2>
            </div>

            {projects.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,360px)_1fr] sm:items-center">
                <div>
                  <label htmlFor="publish-project" className="sr-only">
                    Project to publish
                  </label>
                  <select
                    id="publish-project"
                    value={selectedProjectId}
                    onChange={(event) => selectProject(event.target.value)}
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
                  >
                    {projects.length > 1 ? <option value="">Choose a project…</option> : null}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}{project.githubRepoName ? ` · ${project.githubRepoName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedProject ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                    {selectedProject.githubRepoName ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{selectedProject.githubRepoName}</span>
                      </span>
                    ) : null}
                    {selectedProject.branch ? <span>Branch: {selectedProject.branch}</span> : null}
                    {selectedProject.deployUrl ? (
                      <a
                        href={selectedProject.deployUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--accent)] hover:underline"
                      >
                        Production URL
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Choose the real project you intend to publish.
                  </p>
                )}
              </div>
            ) : providerErrors.projects ? (
              <p className="mt-3 text-xs text-amber-600">{providerErrors.projects}</p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  No saved Xroga project is available yet.
                </p>
                <Link
                  href="/workspace"
                  className="inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                >
                  Open Workspace
                </Link>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <PublishStatusBadge
              label={github?.connected ? 'GitHub connected' : 'GitHub setup'}
              tone={github?.connected ? 'success' : 'neutral'}
            />
            <PublishStatusBadge
              label={
                vercel?.managedDeployAvailable
                  ? 'Vercel managed'
                  : vercel?.connected
                    ? 'Vercel connected'
                    : 'Vercel setup'
              }
              tone={webVercelReady ? 'success' : 'neutral'}
            />
            <PublishStatusBadge
              label={
                supabase?.ready || supabase?.connected || supabase?.provisioned
                  ? 'Supabase connected'
                  : 'Supabase optional'
              }
              tone={
                supabase?.ready || supabase?.connected || supabase?.provisioned
                  ? 'success'
                  : 'neutral'
              }
            />
            <PublishStatusBadge
              label={
                status?.mobile.expoTokenSaved
                  ? status.mobile.expoTokenValid === true
                    ? 'Expo verified'
                    : 'Expo needs attention'
                  : publishError && !status
                    ? 'Expo status unavailable'
                    : 'Expo setup'
              }
              tone={
                status?.mobile.expoTokenValid === true
                  ? 'success'
                  : status?.mobile.expoTokenSaved
                    ? 'warning'
                    : 'neutral'
              }
            />
          </div>
        </div>
      </section>

      <PublishTargetTabs
        target={target}
        onChange={setTarget}
        statuses={targetStatuses}
      />

      {publishError && !status ? (
        <PublishError
          title="Some Publish status is unavailable"
          body="Provider checks that loaded successfully remain usable below. Retry to refresh the full Publish state."
          onRetry={() => void refresh()}
        />
      ) : null}

      {loading && !status ? (
        <PublishLoading />
      ) : (
        <div role="tabpanel" aria-label={`${target} publishing`}>
          {target === 'web' ? (
            <WebPublishPanel
              status={status?.web}
              github={github}
              vercel={vercel}
              supabase={supabase}
              project={selectedProject}
              preferredVercelProject={preferredVercelProject}
              onStartWorkspace={startInWorkspace}
              onRetry={() => void refresh()}
              statusError={publishError}
            />
          ) : target === 'chrome' ? (
            <ChromePublishPanel
              status={status?.chrome}
              project={selectedProject}
              onStartWorkspace={startInWorkspace}
              onRefresh={() => void refresh()}
              githubConnected={github?.connected}
            />
          ) : target === 'desktop' ? (
            <DesktopPublishPanel
              status={status?.desktop}
              project={selectedProject}
              onStartWorkspace={startInWorkspace}
              onRefresh={() => void refresh()}
              githubConnected={github?.connected}
            />
          ) : (
            <MobilePublishPanel
              status={status?.mobile}
              easProjectId={status?.easProjectId}
              onRefresh={() => void refresh()}
              githubConnected={github?.connected}
              statusUnavailable={Boolean(publishError && !status)}
            />
          )}
        </div>
      )}

      {Object.keys(providerErrors).length ? (
        <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-4">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Provider status</p>
          <div className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
            {Object.entries(providerErrors)
              .filter(([key]) => key !== 'projects')
              .map(([key, message]) => (
                <p key={key}>
                  {key}: {message}
                </p>
              ))}
          </div>
        </section>
      ) : null}

      <details className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold text-[var(--text-primary)]">
          Costs & ownership
        </summary>
        <div className="grid gap-4 border-t border-[var(--border-subtle)] p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">Xroga</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              AI build usage, packaging orchestration and supported workflow dispatch are handled through Xroga according to your plan.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">Your providers</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Hosting, Expo build usage, developer accounts, store fees and signing certificates remain on the provider accounts you control.
            </p>
          </div>
        </div>
      </details>

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          Publishing credentials continue to use Xroga’s existing protected credential paths. Secret values are not shown again in this Publish workspace after they are saved.
        </p>
      </div>
    </div>
  );
}