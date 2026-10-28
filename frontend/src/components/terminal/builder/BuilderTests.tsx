'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, Loader2, Play, Wrench, XCircle } from 'lucide-react';

import { BuilderApiError } from '@/lib/builderApi';
import { builderPhase2Api, QA_STATUS_LABEL, type QaReport, type QaSummary, type RepairResult } from '@/lib/builderApiPhase2';
import { cn } from '@/lib/utils';

const REPAIR_LABEL: Record<RepairResult['status'], string> = {
  passed: 'Nothing needed fixing.',
  repaired: 'Fixed and re-tested.',
  unrepaired: 'Could not be fixed.',
  exhausted: 'Tried the allowed number of fixes; it still fails.',
  stalled: 'Stopped: the same problem remained after consecutive fixes.',
  budget_exhausted: 'Stopped: your plan budget does not allow another fix right now.',
  pending_runtime: 'Not run: there is no running copy of the app to test.',
  engine_unavailable: 'Not run: the automatic fixing engine is not available yet.',
  cancelled: 'Cancelled.',
};

function Icon({ status }: { status: 'passed' | 'failed' | 'pending' }) {
  if (status === 'passed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />;
}

/**
 * Browser tests for the project. Results are exactly what the backend recorded against a revision:
 * a pass needs real executed checks, and "not run" is shown as not run.
 */
export function BuilderTests({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [summary, setSummary] = useState<QaSummary | null>(null);
  const [report, setReport] = useState<QaReport | null>(null);
  const [busy, setBusy] = useState<'test' | 'repair' | 'preview' | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [repair, setRepair] = useState<RepairResult | null>(null);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { latest } = await builderPhase2Api.latestQa(projectId);
      setSummary(latest);
      if (latest) setReport((await builderPhase2Api.qaReport(projectId, latest.verificationId)).verification.report);
      else setReport(null);
    } catch {
      setError('The test results could not be loaded.');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setBusy('test');
    setError(null);
    setRepair(null);
    try {
      const result = await builderPhase2Api.runQa(projectId);
      setSummary(result.summary);
      setReport(result.report);
      onChanged();
    } catch (caught) {
      setError(caught instanceof BuilderApiError ? caught.message : 'The tests could not be run.');
    } finally {
      setBusy(null);
    }
  };

  const restartPreview = async () => {
    setBusy('preview');
    setError(null);
    setPreviewNote(null);
    try {
      const result = await builderPhase2Api.restartPreview(projectId);
      setPreviewNote(result.ready ? `Preview started from version ${result.revisionNumber}. ${result.reason}` : result.reason);
      onChanged();
    } catch (caught) {
      setError(caught instanceof BuilderApiError ? caught.message : 'The preview could not be started.');
    } finally {
      setBusy(null);
    }
  };

  const fix = async () => {
    setBusy('repair');
    setError(null);
    setConfirmRepair(false);
    try {
      setRepair(await builderPhase2Api.verifyAndRepair(projectId));
      await load();
      onChanged();
    } catch (caught) {
      setError(caught instanceof BuilderApiError ? caught.message : 'The automatic fix could not run.');
    } finally {
      setBusy(null);
    }
  };

  const failed = report?.checks.filter((check) => check.status === 'failed') ?? [];

  return (
    <section aria-label="Browser tests" className="space-y-2">
      <div className="flex items-center gap-1.5 font-medium">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /> Browser tests
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Xroga opens the running app in a real browser and checks pages, links, forms, sign-in and phone layout. Results are saved with the version they tested.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void run()} className="flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 text-[11px] disabled:opacity-50">
          {busy === 'test' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-3 w-3" aria-hidden="true" />} Run tests
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void restartPreview()} className="flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 text-[11px] disabled:opacity-50">
          {busy === 'preview' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />} Start preview from latest version
        </button>
        {failed.length > 0 && !confirmRepair ? (
          <button type="button" disabled={busy !== null} onClick={() => setConfirmRepair(true)} className="flex items-center gap-1 rounded border border-[var(--accent)] px-2 py-1 text-[11px] text-[var(--accent)] disabled:opacity-50">
            <Wrench className="h-3 w-3" aria-hidden="true" /> Test and fix automatically
          </button>
        ) : null}
      </div>
      {confirmRepair ? (
        <div className="rounded-lg border border-amber-400/30 p-2 text-[11px]">
          <p>Xroga will make up to 3 targeted fixes, re-test after each, and stop if it cannot fix the problem. Each fix uses your plan&apos;s AI budget. Tests are never changed to make them pass.</p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" onClick={() => void fix()} className="rounded border border-[var(--accent)] px-2 py-0.5 text-[var(--accent)]">Start</button>
            <button type="button" onClick={() => setConfirmRepair(false)} className="underline text-[var(--muted)]">Cancel</button>
          </div>
        </div>
      ) : null}
      {busy === 'repair' ? <p className="flex items-center gap-1 text-[11px] text-[var(--muted)]"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Testing and fixing. This can take a few minutes.</p> : null}
      {previewNote ? <p className="text-[11px] text-[var(--muted)]" role="status">{previewNote}</p> : null}
      {error ? <p className="text-[11px] text-amber-400" role="alert">{error}</p> : null}

      {repair ? (
        <div className="rounded-lg border border-[var(--card-border)]/60 p-2 text-[11px]">
          <p className="font-medium">{REPAIR_LABEL[repair.status]}</p>
          <p className="text-[var(--muted)]">{repair.reason}</p>
          <ul className="mt-1 space-y-0.5">
            {repair.attempts.map((attempt) => (
              <li key={attempt.attempt}>Attempt {attempt.attempt}: {attempt.outcome.replace('_', ' ')}. {attempt.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary ? (
        <div className={cn('rounded-lg border p-2 text-[11px]', summary.status === 'passed' ? 'border-emerald-400/30' : summary.status === 'failed' ? 'border-red-400/30' : 'border-amber-400/30')}>
          <p className="font-medium">{QA_STATUS_LABEL[summary.status]}</p>
          <p className="text-[var(--muted)]">{summary.reason}</p>
          {summary.status === 'pending_runtime' ? (
            <p className="mt-1 flex items-start gap-1 text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> Nothing was tested. The app has no running copy yet, so this is not a pass.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--muted)]">No tests have been run on this version yet.</p>
      )}

      {report ? (
        <ul className="space-y-1.5">
          {report.checks.map((check) => (
            <li key={check.id} className="text-[11px]">
              <div className="flex items-start gap-1.5">
                <Icon status={check.status} />
                <div className="min-w-0">
                  <span>{check.title}</span>
                  {check.regression ? <span className="ml-1 rounded bg-red-400/15 px-1 text-[10px] text-red-400">used to pass</span> : null}
                  {check.status === 'pending' && check.pendingReason ? <span className="block text-[var(--muted)]">{check.pendingReason}</span> : null}
                  {check.status === 'failed' && check.evidence ? (
                    <span className="block text-[var(--muted)]">
                      {check.evidence.failedStep ? `Could not ${check.evidence.failedStep}. ` : ''}{check.evidence.message}
                      {check.evidence.screenshot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`data:image/png;base64,${check.evidence.screenshot}`} alt={`Screenshot of the failure: ${check.title}`} className="mt-1 max-h-32 rounded border border-[var(--card-border)]/60" />
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
          {report.notChecked.length > 0 ? (
            <li className="text-[11px] text-[var(--muted)]">{report.notChecked.length} requirement(s) cannot be checked automatically and are not counted as passed.</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
