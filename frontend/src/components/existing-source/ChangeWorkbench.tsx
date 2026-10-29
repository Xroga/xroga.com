'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { type ChangeView, type DeliveryConflict, type SourceBinding, downloadChange, existingSourceApi, existingSourceErrorMessage } from '@/lib/existingSourceApi';
import { cn } from '@/lib/utils';
import { ChangeDetail } from './ChangeDetail';
import { STATUS_LABEL, ago, isActive, statusTone } from './changeView';

const POLL_MS = 1_500;
const SLOW_POLL_MS = 6_000;

/**
 * Ask for a change to the linked project in plain language, watch it happen from the durable record, read the real diff and test
 * evidence, and either open a draft pull request or take a patch. Progress is whatever the server recorded, so a refresh, another tab
 * or a restart shows the same truth; nothing here is simulated.
 */
export function ChangeWorkbench({ binding }: { binding: SourceBinding }) {
  const [changes, setChanges] = useState<ChangeView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<DeliveryConflict[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lostContact, setLostContact] = useState(false);
  const [buildOn, setBuildOn] = useState(true);
  const failures = useRef(0);

  const active = changes.find((c) => c.id === activeId) ?? null;
  const merge = useCallback((next: ChangeView) => setChanges((all) => (all.some((c) => c.id === next.id) ? all.map((c) => (c.id === next.id ? next : c)) : [next, ...all])), []);

  useEffect(() => {
    let cancelled = false;
    setChanges([]); setActiveId(null); setError(null); setNotice(null); setConflicts(null); setAcknowledged(false); setRevision(0);
    existingSourceApi.changes(binding.id).then((r) => { if (cancelled) return; setChanges(r.changes); setActiveId(r.changes[0]?.id ?? null); }).catch((e) => { if (!cancelled) setError(existingSourceErrorMessage(e)); });
    return () => { cancelled = true; };
  }, [binding.id, binding.baseCommitSha]);

  // follow a running change until it finishes; back off when the server cannot be reached
  const activeStatus = active?.status;
  useEffect(() => {
    if (!activeId || !activeStatus || !isActive(activeStatus)) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try { const r = await existingSourceApi.change(activeId); if (stopped) return; merge(r.change); failures.current = 0; setLostContact(false); }
      catch { failures.current += 1; if (failures.current >= 3 && !stopped) setLostContact(true); }
      if (!stopped) timer = setTimeout(() => void tick(), failures.current >= 3 ? SLOW_POLL_MS : POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [activeId, activeStatus, merge]);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(existingSourceErrorMessage(e)); } finally { setBusy(null); }
  };

  const canBuildOn = Boolean(active && ['verified', 'unverified', 'delivered'].includes(active.status) && active.files.length > 0 && active.baseCommitSha === binding.baseCommitSha);
  const submit = () => run('create', async () => {
    const text = instruction.trim();
    if (text.length < 3) return;
    const { change } = await existingSourceApi.createChange(binding.id, text, canBuildOn && buildOn && active ? active.id : undefined);
    merge(change); setActiveId(change.id); setInstruction(''); setConflicts(null); setAcknowledged(false); setRevision(0);
  });

  const cancel = () => active && run('cancel', async () => { merge((await existingSourceApi.cancelChange(active.id)).change); });
  const resume = () => active && run('resume', async () => { merge((await existingSourceApi.resumeChange(active.id)).change); });

  const deliver = (mode: 'pull_request' | 'branch') => active && run('deliver', async () => {
    setConflicts(null);
    try {
      const r = await existingSourceApi.deliverChange(active.id, { mode, allowUnverified: active.status === 'unverified' && acknowledged });
      merge(r.change);
      setNotice(r.alreadyDelivered ? 'This change was already delivered; showing the existing receipt.' : null);
    } catch (e) {
      if (e instanceof ApiError && e.data?.code === 'DELIVERY_CONFLICT') { setConflicts((e.data.conflicts as DeliveryConflict[]) ?? []); return; }
      throw e;
    }
  });

  const exportChange = (format: 'patch' | 'zip') => active && run('export', async () => {
    const { blob, filename } = await downloadChange(active.id, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setNotice(`Saved ${filename}.`);
  });

  return (
    <section aria-label="Change this project" className="space-y-3 border-t border-[var(--card-border)]/40 pt-3" data-testid="change-workbench">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Change this project</h3>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-1">
        <label htmlFor="change-instruction" className="block text-[11px] text-[var(--muted)]">Describe what to fix or add. Xroga works on an isolated copy, runs the project tests, and never writes to your repository from here.</label>
        <textarea id="change-instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} maxLength={8_000} placeholder="For example: the order total is off by a cent when a discount applies; fix `calculateOrderTotal`" className="w-full rounded border border-[var(--card-border)] bg-transparent p-2 text-xs" />
        {canBuildOn ? <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={buildOn} onChange={(e) => setBuildOn(e.target.checked)} />Build on the change shown below (keeps its edits)</label> : null}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy === 'create' || instruction.trim().length < 3} className="inline-flex items-center gap-1 rounded-lg bg-[var(--foreground)] px-3 py-1 text-xs font-medium text-[var(--background)] disabled:opacity-50">
            {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}Start the change
          </button>
          <span className="text-[11px] text-[var(--muted)]">{instruction.length}/8000</span>
        </div>
      </form>
      {error ? <p role="alert" className="text-[11px] text-amber-400">{error}</p> : null}
      {lostContact ? <p role="status" className="text-[11px] text-amber-400">Lost contact with Xroga. The change keeps running; this will update when the connection returns.</p> : null}

      {changes.length > 1 ? (
        <nav aria-label="Earlier changes" className="flex flex-wrap gap-1 text-[11px]">
          {changes.map((c) => (
            <button key={c.id} type="button" onClick={() => { setActiveId(c.id); setConflicts(null); setAcknowledged(false); setRevision(0); }} aria-pressed={c.id === activeId} className={cn('max-w-[16rem] truncate rounded border px-2 py-0.5', c.id === activeId ? 'border-[var(--accent)]' : 'border-[var(--card-border)]')} title={c.instruction}>
              <span className={cn('mr-1', statusTone(c.status) === 'good' ? 'text-emerald-400' : statusTone(c.status) === 'bad' ? 'text-red-400' : 'text-[var(--muted)]')}>{STATUS_LABEL[c.status]}</span>{c.instruction.slice(0, 40)} <span className="text-[var(--muted)]">{ago(c.createdAt)}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {active ? (
        <ChangeDetail change={active} binding={binding} busy={busy} revision={revision || active.revisions[active.revisions.length - 1]?.n || 1} acknowledged={acknowledged} conflicts={conflicts} notice={notice}
          onRevision={setRevision} onAcknowledge={setAcknowledged} onCancel={() => void cancel()} onResume={() => void resume()} onDeliver={(m) => void deliver(m)} onExport={(f) => void exportChange(f)} />
      ) : <p className="text-[11px] text-[var(--muted)]">No changes yet for this project.</p>}
    </section>
  );
}
