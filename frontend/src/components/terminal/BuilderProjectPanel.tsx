'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, RefreshCw, XCircle } from 'lucide-react';

import {
  BUILDER_STATE_LABEL,
  BuilderApiError,
  builderApi,
  type BuilderPreviewLifecycle,
  type BuilderRevisionSummary,
  type BuilderState,
} from '@/lib/builderApi';
import { useBuilderProjectStore } from '@/store/useBuilderProjectStore';
import { cn } from '@/lib/utils';
import { BuilderDatabase } from './builder/BuilderDatabase';
import { BuilderDelivery } from './builder/BuilderDelivery';
import { BuilderHistory } from './builder/BuilderHistory';
import { BuilderHosting } from './builder/BuilderHosting';
import { BuilderProvenance } from './builder/BuilderProvenance';
import { BuilderTests } from './builder/BuilderTests';

type PanelTab = 'overview' | 'history' | 'tests' | 'export' | 'deliver';
const TAB_LABEL: Record<PanelTab, string> = { overview: 'Overview', history: 'Versions', tests: 'Tests', export: 'Export', deliver: 'Deliver' };

const PREVIEW_LABEL: Record<BuilderPreviewLifecycle, string> = {
  not_started: 'Not started',
  starting: 'Starting',
  ready: 'Ready',
  degraded: 'Degraded',
  stopped: 'Stopped',
  expired: 'Expired',
  failed: 'Failed',
};

const STATE_TONE: Record<string, string> = {
  verified: 'text-emerald-400 border-emerald-400/30',
  partial: 'text-amber-400 border-amber-400/30',
  blocked: 'text-amber-400 border-amber-400/30',
  failed: 'text-red-400 border-red-400/30',
  cancelled: 'text-[var(--muted)] border-[var(--card-border)]',
};

function StepIcon({ status }: { status: BuilderState['timeline'][number]['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />;
  if (status === 'active') return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" aria-hidden="true" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />;
  if (status === 'blocked') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />;
}

/**
 * Project status for an AI Product Builder project. Everything here is read from the backend's
 * recorded state: nothing is animated or inferred, and a refresh shows the same recorded truth.
 */
export function BuilderProjectPanel({ projectId, onOpenPreview }: { projectId: string; onOpenPreview?: () => void }) {
  const [state, setState] = useState<BuilderState | null>(null);
  const [revisions, setRevisions] = useState<BuilderRevisionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PanelTab>('overview');
  const [deliveredCount, setDeliveredCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [next, history] = await Promise.all([builderApi.state(projectId), builderApi.revisions(projectId)]);
      setState(next);
      setRevisions(history.revisions);
      setError(null);
    } catch (caught) {
      if (caught instanceof BuilderApiError && caught.status === 404) {
        // Not this account's project (shared browser) or deleted: stop pointing the workspace at it.
        useBuilderProjectStore.getState().setProjectId(null);
        setError('This project was not found.');
      } else {
        setError('The project status could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const active = state?.project.state === 'generating' || state?.project.state === 'verifying';

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), active ? 3_000 : 30_000);
    return () => window.clearInterval(timer);
  }, [load, active]);

  if (loading && !state) {
    return (
      <div className="xv-ws-empty-state">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <strong>Loading project…</strong>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="xv-ws-empty-state">
        <AlertTriangle aria-hidden="true" />
        <strong>{error ?? 'Project unavailable'}</strong>
        <button type="button" onClick={() => void load()} className="mt-2 text-xs underline">
          Try again
        </button>
      </div>
    );
  }

  const { project, head, preview, timeline } = state;
  return (
    <div className="h-full overflow-y-auto p-3 space-y-4 text-xs" data-testid="builder-project-panel">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{project.title}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            Project {project.id.slice(0, 8)} · {project.productType.replace(/_/g, ' ')}
            {head ? ` · revision ${head.revisionNumber} (${head.contentSha256.slice(0, 8)})` : ''}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', STATE_TONE[project.state] ?? 'text-[var(--foreground)] border-[var(--card-border)]')}>
          {BUILDER_STATE_LABEL[project.state]}
        </span>
        <button type="button" onClick={() => void load()} className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)]" aria-label="Refresh project status">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </header>

      {project.stateReason ? <p className="text-[11px] text-[var(--muted)]">{project.stateReason}</p> : null}
      {error ? <p className="text-[11px] text-amber-400">{error}</p> : null}

      <nav aria-label="Project sections" className="flex gap-1 border-b border-[var(--card-border)]/40">
        {(Object.keys(TAB_LABEL) as PanelTab[]).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={cn('px-2 py-1 text-[11px]', tab === id ? 'border-b-2 border-[var(--accent)] text-[var(--foreground)]' : 'text-[var(--muted)]')}>
            {TAB_LABEL[id]}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
      <>

      <section aria-label="What Xroga actually did">
        <ol className="space-y-1.5">
          {timeline.map((entry) => (
            <li key={entry.step} className="flex items-start gap-2">
              <StepIcon status={entry.status} />
              <div className="min-w-0">
                <span className="font-medium">{entry.step}</span>
                <span className="block text-[11px] text-[var(--muted)]">{entry.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Preview status" className="rounded-lg border border-[var(--card-border)]/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">Preview: {PREVIEW_LABEL[preview.lifecycle]}</span>
          {preview.lifecycle === 'ready' || preview.lifecycle === 'degraded' || preview.lifecycle === 'stopped' || preview.lifecycle === 'expired' ? (
            <button type="button" onClick={onOpenPreview} className="text-[11px] underline">
              Open preview
            </button>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{preview.reason}</p>
      </section>

      {project.spec.unsupported.length > 0 ? (
        <section aria-label="Not available yet" className="rounded-lg border border-amber-400/30 p-2.5">
          <p className="font-medium text-amber-400">Needs your attention</p>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-[var(--muted)] space-y-0.5">
            {project.spec.unsupported.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Acceptance criteria">
        <p className="font-medium">Acceptance criteria ({project.spec.acceptanceCriteria.length})</p>
        <ul className="mt-1 list-disc pl-4 text-[11px] text-[var(--muted)] space-y-0.5">
          {project.spec.acceptanceCriteria.slice(0, 8).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      </>
      ) : null}

      {tab === 'history' ? <BuilderHistory projectId={projectId} revisions={revisions} currentRevisionId={project.currentRevisionId} onChanged={() => void load()} /> : null}
      {tab === 'tests' ? <BuilderTests projectId={projectId} onChanged={() => void load()} /> : null}
      {tab === 'export' ? <BuilderDelivery projectId={projectId} title={project.title} onChanged={() => void load()} /> : null}
      {tab === 'deliver' ? (
        <div className="space-y-4">
          <BuilderDatabase projectId={projectId} onChanged={() => setDeliveredCount((count) => count + 1)} />
          <BuilderHosting projectId={projectId} title={project.title} headRevisionNumber={project.currentRevisionNumber} onChanged={() => setDeliveredCount((count) => count + 1)} />
          <BuilderProvenance projectId={projectId} refreshKey={deliveredCount} />
        </div>
      ) : null}

      <p className="text-[10px] text-[var(--muted)]">
        Starter {project.starter.starterId}@{project.starter.starterVersion} ({project.starter.license}). Your source is saved on Xroga and survives the preview ending.
      </p>
    </div>
  );
}
