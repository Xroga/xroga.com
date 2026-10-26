'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface WorkflowOutcome {
  stepIndex: number;
  request: string;
  kind: 'read' | 'action' | 'web';
  toolkit: string;
  toolSlug: string;
  data: string;
}

interface WorkflowStep {
  kind: 'read' | 'action' | 'web';
  request: string;
  dependsOnPrevious: boolean;
}

interface Workflow {
  id: string;
  request: string;
  status: 'running' | 'executing' | 'awaiting_confirmation' | 'setup_required' | 'completed' | 'failed' | 'cancelled';
  stepIndex: number;
  stepCount: number;
  steps: WorkflowStep[];
  outcomes: WorkflowOutcome[];
  confirmationId: string | null;
  failureCode: string | null;
}

export default function BusinessWorkflowPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] ?? '' : '';
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const result = await apiFetch<{ workflow: Workflow }>(`/api/phase1/business-workflows/${encodeURIComponent(id)}`);
      setWorkflow(result.workflow);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workflow could not be loaded.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const change = async (action: 'resume' | 'cancel') => {
    if (!id || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<{ workflow: Workflow }>(`/api/phase1/business-workflows/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', body: JSON.stringify({}),
      });
      setWorkflow(result.workflow);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Workflow could not ${action}.`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
    <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]">Xroga Connect</p><h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Connected-app workflow</h1></div>
    {error ? <p className="rounded-xl border border-red-500/25 p-4 text-sm text-red-500">{error}</p> : null}
    {!workflow && !error ? <p className="text-sm text-[var(--text-secondary)]">Loading workflow…</p> : null}
    {workflow ? <div className="space-y-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
      <div><p className="text-xs uppercase text-[var(--text-secondary)]">Original request</p><p className="mt-1 text-sm text-[var(--text-primary)]">{workflow.request}</p></div>
      <div><p className="text-xs uppercase text-[var(--text-secondary)]">Status</p><p className="mt-1 text-sm font-semibold capitalize text-[var(--text-primary)]">{workflow.status.replaceAll('_', ' ')} · Step {Math.min(workflow.stepIndex + 1, workflow.stepCount)} of {workflow.stepCount}</p></div>
      <ol className="space-y-3" aria-label="Workflow steps">{workflow.steps?.map((step, index) => {
        const outcome = workflow.outcomes.find((item) => item.stepIndex === index);
        const state = outcome ? 'Completed' : index === workflow.stepIndex && workflow.status === 'awaiting_confirmation' ? 'Awaiting your approval' : index === workflow.stepIndex && workflow.status === 'setup_required' ? 'Connection or input needed' : index === workflow.stepIndex && workflow.status === 'running' ? 'In progress' : 'Pending';
        return <li key={index} className="rounded-xl border border-[var(--border-subtle)] p-4"><p className="text-sm font-medium text-[var(--text-primary)]">{index + 1}. {step.request}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{step.kind === 'action' ? 'App action' : step.kind === 'web' ? 'Public-web research' : 'App read'} · {state}</p>{outcome ? <><p className="mt-1 text-xs text-[var(--text-secondary)]">{outcome.toolkit} · {outcome.toolSlug}</p><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--text-secondary)]">{outcome.data.slice(0, 3_000)}</pre></> : null}</li>;
      })}</ol>
      {workflow.failureCode ? <p className="text-sm text-amber-500">This workflow needs attention: {workflow.failureCode}</p> : null}
      {workflow.confirmationId ? <a className="inline-flex rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white" href={`/dashboard/actions/confirm/${encodeURIComponent(workflow.confirmationId)}`}>Review next action</a> : null}
      {workflow.status === 'setup_required' && !['READ_RESULT_TOO_LARGE', 'WEB_EVIDENCE_UNAVAILABLE'].includes(workflow.failureCode ?? '') ? <button type="button" disabled={busy} onClick={() => { void change('resume'); }} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Resume after connecting app</button> : null}
      {workflow.status !== 'completed' && workflow.status !== 'cancelled' ? <button type="button" disabled={busy} onClick={() => { void change('cancel'); }} className="ml-3 rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50">Cancel remaining steps</button> : null}
      <p className="text-xs text-[var(--text-secondary)]">Only completed steps changed external apps. A cancelled workflow does not undo them.</p>
    </div> : null}
  </div>;
}
