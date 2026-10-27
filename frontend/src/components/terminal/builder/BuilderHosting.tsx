'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Loader2, Rocket } from 'lucide-react';

import { BuilderApiError } from '@/lib/builderApi';
import { newOperationKey } from '@/lib/builderApiPhase2';
import {
  builderPhase3Api,
  confirmationMatches,
  type ExternalOperationView,
  type OperationStatus,
  type VercelPreviewPlan,
  type VercelPromotionPlan,
  type VercelState,
  type VercelTargets,
} from '@/lib/builderApiPhase3';

const STATUS_TEXT: Record<OperationStatus, string> = {
  prepared: 'Waiting for your approval',
  approved: 'Approved, not started',
  executing: 'Running',
  succeeded: 'Done and verified',
  failed: 'Did not complete',
  ambiguous: 'Vercel did not confirm the result',
  diverged: 'Stopped',
  cancelled: 'Cancelled',
};

/** Preview on your own Vercel account, then a separate, explicitly typed production step. */
export function BuilderHosting({ projectId, title, headRevisionNumber, onChanged }: { projectId: string; title: string; headRevisionNumber: number; onChanged: () => void }) {
  const [targets, setTargets] = useState<VercelTargets | null>(null);
  const [state, setState] = useState<VercelState | null>(null);
  const [scopeId, setScopeId] = useState<string>('');
  const [name, setName] = useState(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'xroga-app');
  const [preview, setPreview] = useState<ExternalOperationView<VercelPreviewPlan> | null>(null);
  const [production, setProduction] = useState<ExternalOperationView<VercelPromotionPlan> | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextTargets, nextState] = await Promise.all([builderPhase3Api.vercelTargets(), builderPhase3Api.vercel(projectId)]);
      setTargets(nextTargets);
      setState(nextState);
      const open = (action: string) => nextState.operations.find((operation) => operation.action === action && ['prepared', 'approved', 'failed', 'ambiguous'].includes(operation.status));
      setPreview((open('deploy_preview') as ExternalOperationView<VercelPreviewPlan> | undefined) ?? null);
      setProduction((open('promote_production') as ExternalOperationView<VercelPromotionPlan> | undefined) ?? null);
    } catch {
      setMessage('Hosting status could not be loaded.');
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

  const latestPreview = state?.state.latestPreview ?? null;
  const latestProduction = state?.state.latestProduction ?? null;
  const previewUrl = (latestPreview?.receipt?.deployment as { url?: string } | undefined)?.url ?? null;
  const productionUrl = (latestProduction?.receipt?.production as { url?: string } | undefined)?.url ?? null;
  const remoteStatus = (latestPreview?.receipt?.remote as { status?: string; reason?: string } | undefined) ?? null;
  const previewedRevision = (latestPreview?.receipt?.source as { revisionNumber?: number } | undefined)?.revisionNumber ?? null;
  const previousScopeId = (latestPreview?.receipt?.scope as { id?: string | null } | undefined)?.id ?? null;
  const publishedRevision = latestProduction?.plan.revision.number ?? null;
  const connected = Boolean(targets?.connected);

  // A newer saved version than the one on Vercel: it can be deployed again, into the project Xroga already made.
  const previewIsOld = previewedRevision !== null && headRevisionNumber > previewedRevision;
  const productionIsOld = publishedRevision !== null && previewedRevision !== null && previewedRevision > publishedRevision;

  const preparePreview = (fresh: boolean) =>
    guarded('prepare', async () => {
      const result = await builderPhase3Api.preparePreview(projectId, {
        operationKey: newOperationKey('preview'),
        scopeId: fresh ? scopeId || null : previousScopeId,
        ...(fresh ? { projectName: name.trim() } : {}),
      });
      setPreview(result.operation);
    });

  const runPreview = (operation: ExternalOperationView<VercelPreviewPlan>) =>
    guarded('preview', async () => {
      await builderPhase3Api.approveVercel(projectId, operation.id, operation.planDigest);
      const result = await builderPhase3Api.executePreview(projectId, operation.id);
      setPreview(null);
      const remote = result.operation.receipt?.remote as { status?: string } | undefined;
      setMessage(remote?.status === 'passed' ? 'Preview is live and the remote tests passed.' : `Preview deployed. Remote tests: ${remote?.status ?? 'not run'}.`);
      await load();
      onChanged();
    });

  const prepareProduction = (previewOperationId: string) =>
    guarded('prepare', async () => {
      setProduction((await builderPhase3Api.prepareProduction(projectId, { operationKey: newOperationKey('prod'), previewOperationId })).operation);
      setTyped('');
    });

  const publish = (operation: ExternalOperationView<VercelPromotionPlan>) =>
    guarded('publish', async () => {
      await builderPhase3Api.approveProduction(projectId, operation.id, { digest: operation.planDigest, confirmation: typed.trim() });
      await builderPhase3Api.executeProduction(projectId, operation.id);
      setProduction(null);
      setTyped('');
      setMessage('Published to production and verified read-only.');
      await load();
      onChanged();
    });

  const cancel = (kind: 'preview' | 'production', operationId: string) =>
    guarded('cancel', async () => {
      await builderPhase3Api.cancelVercel(projectId, operationId);
      if (kind === 'preview') setPreview(null);
      else setProduction(null);
      await load();
    });

  const productionCard = (
    <div className="rounded-lg border border-red-400/30 p-2 text-[11px]" aria-label="Production">
      <p className="flex items-center gap-1 font-medium"><Rocket className="h-3 w-3" aria-hidden="true" /> Publish to production</p>
      {!production ? (
        remoteStatus?.status === 'passed' && latestPreview ? (
          <button type="button" disabled={busy !== null || !connected} onClick={() => void prepareProduction(latestPreview.id)} className="mt-1 rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-50">
            {busy === 'prepare' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Preparing" /> : 'Review what will go live'}
          </button>
        ) : (
          <p className="mt-1 text-[var(--muted)]">Blocked until the remote tests on the preview have passed (currently: {remoteStatus?.status ?? 'not run'}).</p>
        )
      ) : (
        <div>
          <p className="mt-1">This makes <strong>{production.plan.projectName}</strong> version {production.plan.revision.number} live at <strong>{production.plan.productionUrl}</strong>.</p>
          <p className="text-[var(--muted)]">Remote tests: {production.plan.remoteTests.status}. After publishing, only read-only checks run on the live site; no form is submitted.</p>
          {production.plan.warnings.map((warning) => <p key={warning} className="mt-1 flex items-start gap-1 text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{warning}</p>)}
          <label className="mt-1.5 block">Type <code>{production.plan.confirmationPhrase}</code> to confirm
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="mt-0.5 block w-full rounded border border-[var(--card-border)] bg-transparent p-1" />
          </label>
          {production.failure ? <p className="mt-1 text-amber-400" role="alert">{production.failure}</p> : null}
          <div className="mt-1.5 flex gap-2">
            <button type="button" disabled={busy !== null || !connected || !confirmationMatches(typed, production.plan.confirmationPhrase)} onClick={() => void publish(production)} className="rounded border border-red-400 px-2 py-0.5 text-red-400 disabled:opacity-50">
              {busy === 'publish' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Publishing" /> : 'Publish to production'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void cancel('production', production.id)} className="underline text-[var(--muted)]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Hosting" className="space-y-2">
      <div className="flex items-center gap-1.5 font-medium"><Globe className="h-3.5 w-3.5" aria-hidden="true" /> Hosting (Vercel)</div>
      {message ? <p className="text-[11px] text-amber-400" role="status">{message}</p> : null}
      {!targets || !state ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading hosting" />
      ) : (
        <>
          {/* What already exists is always shown, even if Vercel is disconnected or the connection was revoked. */}
          {!connected ? (
            <p className="text-[11px] text-[var(--muted)]">{targets.notes[0] ?? 'Vercel is not connected.'} {latestPreview ? 'What was already deployed is shown below; new deployments need the connection.' : 'Nothing is deployed until you approve it.'}</p>
          ) : null}

          {latestPreview && previewUrl ? (
            <div className="rounded-lg border border-emerald-400/30 p-2 text-[11px]">
              <p className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" /> Preview deployed{previewedRevision !== null ? ` (version ${previewedRevision})` : ''}</p>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">{previewUrl} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
              <p className="text-[var(--muted)]">Remote tests: {remoteStatus?.status ?? 'not run'}{remoteStatus?.reason ? `. ${remoteStatus.reason}` : ''}</p>
              <p className="text-[var(--muted)]">A preview is not your live site. Production is a separate step.</p>
              {previewIsOld ? <p className="mt-1 text-amber-400">Your latest saved version is {headRevisionNumber}. This preview shows version {previewedRevision}.</p> : null}
            </div>
          ) : null}

          {connected && !preview && (!latestPreview || !previewUrl) ? (
            <div className="space-y-1.5 text-[11px]">
              <label className="block">Vercel account or team
                <select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="mt-0.5 block w-full rounded border border-[var(--card-border)] bg-transparent p-1">
                  {targets.scopes.map((scope) => <option key={scope.id ?? 'personal'} value={scope.id ?? ''}>{scope.name}{scope.kind === 'team' ? ' (team)' : ''}</option>)}
                </select>
              </label>
              <label className="block">Project name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-0.5 block w-full rounded border border-[var(--card-border)] bg-transparent p-1" />
              </label>
              <button type="button" disabled={busy !== null || !name.trim()} onClick={() => void preparePreview(true)} className="rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-50">
                {busy === 'prepare' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Preparing" /> : 'Review the preview deployment'}
              </button>
            </div>
          ) : null}

          {connected && !preview && previewIsOld ? (
            <button type="button" disabled={busy !== null} onClick={() => void preparePreview(false)} className="rounded border border-[var(--card-border)] px-2 py-1 text-[11px] disabled:opacity-50">
              {busy === 'prepare' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Preparing" /> : `Review a preview of version ${headRevisionNumber}`}
            </button>
          ) : null}

          {preview ? (
            <div className="rounded-lg border border-[var(--accent)]/40 p-2 text-[11px]" aria-label="Preview to approve">
              <p className="font-medium">Deploy a preview to {preview.plan.scope.name}</p>
              <p>Project <strong>{preview.plan.project.name}</strong> ({preview.plan.project.mode === 'create' ? 'new' : 'the project Xroga already made'}), version {preview.plan.revision.number}, {preview.plan.revision.fileCount} files</p>
              <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">{preview.plan.behaviour.map((line) => <li key={line}>{line}</li>)}</ul>
              {preview.plan.warnings.map((warning) => <p key={warning} className="mt-1 flex items-start gap-1 text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{warning}</p>)}
              <p className="mt-1 text-[var(--muted)]">{preview.plan.costNote}</p>
              <p className="mt-1 font-medium">{STATUS_TEXT[preview.status]}</p>
              {preview.failure ? <p className="text-amber-400" role="alert">{preview.failure}</p> : null}
              <div className="mt-1.5 flex gap-2">
                <button type="button" disabled={busy !== null || !connected} onClick={() => void runPreview(preview)} className="rounded border border-[var(--accent)] px-2 py-0.5 text-[var(--accent)] disabled:opacity-50">
                  {busy === 'preview' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Working" /> : preview.status === 'failed' || preview.status === 'ambiguous' ? 'Approve and retry' : 'Approve and deploy preview'}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void cancel('preview', preview.id)} className="underline text-[var(--muted)]">Cancel</button>
              </div>
            </div>
          ) : null}

          {/* Production is its own card: it is never reached by approving a preview. */}
          {latestPreview && previewUrl && (!latestProduction || productionIsOld || production) ? productionCard : null}

          {latestProduction && productionUrl ? (
            <div className="rounded-lg border border-emerald-400/30 p-2 text-[11px]">
              <p className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" /> Live in production{publishedRevision !== null ? ` (version ${publishedRevision})` : ''}</p>
              <a href={productionUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">{productionUrl} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
              {productionIsOld ? <p className="mt-1 text-amber-400">A newer previewed version ({previewedRevision}) is not live yet.</p> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
