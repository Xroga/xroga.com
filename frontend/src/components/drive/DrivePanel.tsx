'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, RefreshCw, Trash2, Upload, X } from 'lucide-react';

import { DRIVE_ENABLED, driveApi, driveErrorMessage, type DriveObject, type DriveObjectState } from '@/lib/driveApi';
import { uploadFile, UploadError } from '@/lib/driveUpload';
import { cn } from '@/lib/utils';

const PAGE = 50;

const STATE_LABEL: Record<DriveObjectState, string> = {
  PENDING: 'Waiting for upload',
  UPLOADING: 'Uploading',
  VERIFYING: 'Checking',
  READY: 'Stored',
  FAILED: 'Failed',
  QUARANTINED: 'Held back',
  CORRUPT: 'Damaged',
  DELETING: 'Deleting',
  DELETED: 'Deleted',
};

const STATE_TONE: Partial<Record<DriveObjectState, string>> = {
  READY: 'text-emerald-400 border-emerald-400/30',
  FAILED: 'text-red-400 border-red-400/30',
  CORRUPT: 'text-red-400 border-red-400/30',
  QUARANTINED: 'text-amber-400 border-amber-400/30',
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Size not verified yet';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

interface Transfer { key: string; name: string; sent: number; total: number; error: string | null; controller: AbortController }

/**
 * Xroga Drive for a signed-in user: the files Xroga stores for them (uploads, browser run evidence), with upload, download and
 * delete. Everything shown is what the backend recorded; a file is "Stored" only after the server verified it, and a failed or
 * rejected upload says so instead of disappearing.
 */
export function DrivePanel({ projectId }: { projectId?: string }) {
  const [objects, setObjects] = useState<DriveObject[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (after?: string) => {
    try {
      const { objects: page } = await driveApi.list({ projectId, limit: PAGE, ...(after ? { after } : {}) });
      setObjects((current) => (after ? [...current, ...page] : page));
      setMore(page.length === PAGE);
      setError(null);
    } catch (caught) {
      setError(driveErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const update = (key: string, patch: Partial<Transfer>) => setTransfers((current) => current.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const start = useCallback(async (files: File[]) => {
    for (const file of files) {
      const key = `${file.name}:${file.size}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const controller = new AbortController();
      setTransfers((current) => [...current, { key, name: file.name, sent: 0, total: file.size, error: null, controller }]);
      try {
        await uploadFile(file, { api: driveApi }, { projectId: projectId ?? null, signal: controller.signal, onProgress: (p) => update(key, { sent: p.sentBytes, total: p.totalBytes }) });
        setTransfers((current) => current.filter((t) => t.key !== key));
        await load();
      } catch (caught) {
        if (caught instanceof UploadError && caught.code === 'ABORTED') setTransfers((current) => current.filter((t) => t.key !== key));
        else update(key, { error: caught instanceof UploadError ? caught.message : driveErrorMessage(caught) });
      }
    }
  }, [load, projectId]);

  const download = async (object: DriveObject) => {
    setBusy(object.id);
    try {
      const link = await driveApi.downloadUrl(object.id);
      // a short-lived signed link: the browser fetches the bytes directly from storage
      const anchor = document.createElement('a');
      anchor.href = link.url; anchor.rel = 'noopener'; anchor.download = link.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setError(null);
    } catch (caught) {
      setError(driveErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (object: DriveObject) => {
    setBusy(object.id);
    try {
      await driveApi.remove(object.id);
      setConfirming(null);
      await load();
    } catch (caught) {
      setError(driveErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (!DRIVE_ENABLED) {
    return (
      <div className="xv-ws-empty-state">
        <AlertTriangle aria-hidden="true" />
        <strong>Xroga Drive is not available yet.</strong>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 text-sm" data-testid="drive-panel">
      <header className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">Xroga Drive</h1>
        <button type="button" onClick={() => void load()} className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--foreground)]" aria-label="Refresh files">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">
          <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Upload
        </button>
        <input ref={input} type="file" multiple hidden onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; if (files.length) void start(files); }} />
      </header>

      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const files = [...event.dataTransfer.files]; if (files.length) void start(files); }}
        className={cn('rounded-lg border border-dashed p-4 text-center text-xs text-[var(--muted)]', dragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--card-border)]')}
      >
        Drop files here. Files are private to your account and are checked before they are stored.
      </div>

      {error ? <p role="alert" className="text-xs text-amber-400">{error}</p> : null}

      {transfers.length > 0 ? (
        <ul aria-label="Uploads in progress" className="space-y-2">
          {transfers.map((t) => (
            <li key={t.key} className="rounded-lg border border-[var(--card-border)]/60 p-2.5">
              <div className="flex items-center gap-2">
                {t.error ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className="text-[11px] text-[var(--muted)]">{t.error ? 'Not stored' : `${formatBytes(t.sent)} of ${formatBytes(t.total)}`}</span>
                <button type="button" onClick={() => { t.controller.abort(); setTransfers((current) => current.filter((x) => x.key !== t.key)); }} className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]" aria-label={t.error ? `Dismiss ${t.name}` : `Cancel upload of ${t.name}`}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {t.error ? <p role="alert" className="mt-1 text-[11px] text-red-400">{t.error}</p> : <progress className="mt-1.5 h-1 w-full" value={t.sent} max={Math.max(1, t.total)} aria-label={`Progress of ${t.name}`} />}
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading files</div>
      ) : objects.length === 0 && !error ? (
        <p className="py-8 text-center text-xs text-[var(--muted)]">No files yet.</p>
      ) : (
        <ul aria-label="Your files" className="divide-y divide-[var(--card-border)]/40 rounded-lg border border-[var(--card-border)]/60">
          {objects.map((object) => (
            <li key={object.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <FileText className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{object.filename}</p>
                <p className="text-[11px] text-[var(--muted)]">{formatBytes(object.size)} · {new Date(object.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px]', STATE_TONE[object.state] ?? 'border-[var(--card-border)] text-[var(--muted)]')}>
                {object.state === 'READY' ? <CheckCircle2 className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}{STATE_LABEL[object.state]}
              </span>
              {object.state === 'READY' ? (
                <button type="button" onClick={() => void download(object)} disabled={busy === object.id} className="rounded p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50" aria-label={`Download ${object.filename}`}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              {confirming === object.id ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  Delete this file?
                  <button type="button" onClick={() => void remove(object)} disabled={busy === object.id} className="rounded border border-red-400/40 px-2 py-0.5 text-red-400 disabled:opacity-50">Delete</button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded border border-[var(--card-border)] px-2 py-0.5">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(object.id)} disabled={busy === object.id || object.state === 'DELETING'} className="rounded p-1.5 text-[var(--muted)] hover:text-red-400 disabled:opacity-50" aria-label={`Delete ${object.filename}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {more ? (
        <button type="button" onClick={() => void load(objects[objects.length - 1]?.id)} className="mx-auto block rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs">
          Load more
        </button>
      ) : null}
    </div>
  );
}
