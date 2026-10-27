'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Loader2 } from 'lucide-react';

import { BuilderApiError } from '@/lib/builderApi';
import { newOperationKey } from '@/lib/builderApiPhase2';
import {
  builderPhase3Api,
  type ExternalOperationView,
  type OperationStatus,
  type SupabaseBindPlan,
  type SupabaseMigrationPlan,
  type SupabaseState,
  type SupabaseTargets,
} from '@/lib/builderApiPhase3';

const STATUS_TEXT: Record<OperationStatus, string> = {
  prepared: 'Waiting for your approval',
  approved: 'Approved, not started',
  executing: 'Running',
  succeeded: 'Done and verified in your database',
  failed: 'Did not complete',
  ambiguous: 'Supabase did not confirm the result',
  diverged: 'Stopped: the database changed',
  cancelled: 'Cancelled',
};

type Pending = ExternalOperationView<SupabaseBindPlan | SupabaseMigrationPlan>;
const isMigration = (plan: SupabaseBindPlan | SupabaseMigrationPlan): plan is SupabaseMigrationPlan => 'sql' in plan;

/** Your own Supabase project: pick it, review the generated schema, approve it. Nothing runs before approval. */
export function BuilderDatabase({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [targets, setTargets] = useState<SupabaseTargets | null>(null);
  const [state, setState] = useState<SupabaseState | null>(null);
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextTargets, nextState] = await Promise.all([builderPhase3Api.supabaseTargets(), builderPhase3Api.supabase(projectId)]);
      setTargets(nextTargets);
      setState(nextState);
      setSelected((current) => current || nextTargets.projects[0]?.ref || '');
      setPending(nextState.operations.find((operation) => ['prepared', 'approved', 'failed', 'ambiguous'].includes(operation.status)) ?? null);
    } catch {
      setMessage('Database status could not be loaded.');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const guarded = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof BuilderApiError ? error.message : 'That did not complete.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const prepareBind = () => guarded('prepare', async () => { setPending((await builderPhase3Api.prepareBind(projectId, { operationKey: newOperationKey('bind'), projectRef: selected })).operation); });
  const prepareMigration = () => guarded('prepare', async () => { setPending((await builderPhase3Api.prepareMigration(projectId, newOperationKey('schema'))).operation); });

  const approveAndRun = (operation: Pending) =>
    guarded('execute', async () => {
      // The approval quotes the digest of the exact plan on screen.
      await builderPhase3Api.approveSupabase(projectId, operation.id, operation.planDigest);
      if (isMigration(operation.plan)) await builderPhase3Api.executeMigration(projectId, operation.id);
      else await builderPhase3Api.executeBind(projectId, operation.id);
      setPending(null);
      setMessage('Done and verified in your Supabase project.');
      await load();
      onChanged();
    });

  const cancel = (operation: Pending) =>
    guarded('cancel', async () => {
      await builderPhase3Api.cancelSupabase(projectId, operation.id);
      setPending(null);
      await load();
    });

  const applied = state?.operations.some((operation) => operation.status === 'succeeded' && operation.action === 'apply_migration') ?? false;

  return (
    <section aria-label="Your database" className="space-y-2">
      <div className="flex items-center gap-1.5 font-medium"><Database className="h-3.5 w-3.5" aria-hidden="true" /> Your database (Supabase)</div>
      {message ? <p className="text-[11px] text-amber-400" role="status">{message}</p> : null}
      {!targets || !state ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading database" />
      ) : !targets.connected ? (
        <>
          <p className="text-[11px] text-[var(--muted)]">{targets.notes[0] ?? 'Supabase is not connected.'} {state.binding ? 'What was already set up is shown below; new changes need the connection.' : 'Nothing is created in your account until you approve it.'}</p>
          {state.binding ? (
            <div className="rounded-lg border border-[var(--card-border)] p-2 text-[11px]">
              <p className="font-medium">Was using {state.binding.projectName}</p>
              <p className="text-[var(--muted)]">{state.operations.some((operation) => operation.status === 'succeeded' && operation.action === 'apply_migration') ? 'The schema was applied and verified earlier.' : 'No schema has been applied.'}</p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {state.binding ? (
            <div className="rounded-lg border border-emerald-400/30 p-2 text-[11px]">
              <p className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" /> Using {state.binding.projectName}</p>
              <p className="text-[var(--muted)]">{state.binding.existingTables.length > 0 ? `Existing tables are left untouched (${state.binding.existingTables.length}).` : 'No existing tables found.'} Xroga uses only the public key. It does not read your secret or service-role key.</p>
            </div>
          ) : null}

          {!pending && !state.binding ? (
            <div className="space-y-1.5 text-[11px]">
              <label className="block">Supabase project
                <select value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-0.5 block w-full rounded border border-[var(--card-border)] bg-transparent p-1">
                  {targets.projects.map((entry) => <option key={entry.ref} value={entry.ref}>{entry.name}{entry.region ? ` (${entry.region})` : ''}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy !== null || !selected} onClick={() => void prepareBind()} className="rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-50">
                {busy === 'prepare' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Preparing" /> : 'Review this connection'}
              </button>
            </div>
          ) : null}

          {!pending && state.binding && state.schema && !applied ? (
            <div className="space-y-1.5 text-[11px]">
              <p className="text-[var(--muted)]">Your app needs {state.schema.tables.join(', ')}. Review the exact SQL before anything runs.</p>
              <button type="button" disabled={busy !== null} onClick={() => void prepareMigration()} className="rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-50">
                {busy === 'prepare' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Preparing" /> : 'Review the schema'}
              </button>
            </div>
          ) : null}
          {applied ? <p className="flex items-center gap-1 text-[11px]"><CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" /> Schema applied and read back with row-level security on.</p> : null}

          {pending ? (
            <div className="rounded-lg border border-[var(--accent)]/40 p-2 text-[11px]" aria-label="Action to approve">
              {isMigration(pending.plan) ? (
                <>
                  <p className="font-medium">Apply a schema to {pending.plan.projectName}</p>
                  <p>Creates: <strong>{pending.plan.createsTables.join(', ')}</strong> · risk: {pending.plan.risk}</p>
                  <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">{pending.plan.protections.map((line) => <li key={line}>{line}</li>)}</ul>
                  {pending.plan.warnings.map((warning) => <p key={warning} className="mt-1 flex items-start gap-1 text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{warning}</p>)}
                  <details className="mt-1"><summary className="cursor-pointer text-[var(--muted)]">Show the exact SQL</summary><pre className="mt-1 max-h-56 overflow-auto rounded bg-black/20 p-1.5 text-[10px]">{pending.plan.sql}</pre></details>
                </>
              ) : (
                <>
                  <p className="font-medium">Use {pending.plan.project.name} for this app</p>
                  <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">{pending.plan.notes.map((line) => <li key={line}>{line}</li>)}</ul>
                </>
              )}
              <p className="mt-1 font-medium">{STATUS_TEXT[pending.status]}</p>
              {pending.failure ? <p className="text-amber-400" role="alert">{pending.failure}</p> : null}
              <div className="mt-1.5 flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void approveAndRun(pending)} className="rounded border border-[var(--accent)] px-2 py-0.5 text-[var(--accent)] disabled:opacity-50">
                  {busy === 'execute' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Working" /> : pending.status === 'failed' || pending.status === 'ambiguous' ? 'Approve and retry' : 'Approve and run'}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void cancel(pending)} className="underline text-[var(--muted)]">Cancel</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
