'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, FileText, Folder, GitBranch, Link2, Loader2, Lock, RefreshCw, ShieldAlert, Unlink } from 'lucide-react';

import {
  EXISTING_SOURCE_ENABLED,
  existingSourceApi,
  existingSourceErrorMessage,
  type CodeMapStatus,
  type DirectoryListing,
  type FileContent,
  type LocateResult,
  type SearchResult,
  type RepositoryChoice,
  type SourceBinding,
  type VerifiedBinding,
} from '@/lib/existingSourceApi';
import { cn } from '@/lib/utils';
import { ChangeWorkbench } from './ChangeWorkbench';

const STATE_LABEL: Record<SourceBinding['state'], string> = {
  linked: 'Linked',
  access_lost: 'Access lost',
  transferred: 'Transferred',
  account_changed: 'Account changed',
  unlinked: 'Unlinked',
};

const STATE_TONE: Record<SourceBinding['state'], string> = {
  linked: 'text-emerald-400 border-emerald-400/30',
  access_lost: 'text-red-400 border-red-400/30',
  transferred: 'text-amber-400 border-amber-400/30',
  account_changed: 'text-amber-400 border-amber-400/30',
  unlinked: 'text-[var(--muted)] border-[var(--card-border)]',
};

const short = (sha: string) => sha.slice(0, 7);

/**
 * Link an EXISTING GitHub repository to Xroga and look at it: which repository (by GitHub's own id), which connected account, which
 * exact commit, what permissions, and the real files at that commit. Nothing here edits or writes anything; it shows the recorded
 * state of the link and fails closed (with the reason) when access is lost, the repository is transferred or another account is
 * connected.
 */
export function ExistingSourcePanel() {
  const [links, setLinks] = useState<SourceBinding[]>([]);
  const [choices, setChoices] = useState<RepositoryChoice[] | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [branch, setBranch] = useState('');
  const [selected, setSelected] = useState<RepositoryChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<VerifiedBinding | null>(null);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [file, setFile] = useState<FileContent | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [map, setMap] = useState<CodeMapStatus | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<SearchResult | null>(null);
  const [ask, setAsk] = useState('');
  const [located, setLocated] = useState<LocateResult | null>(null);
  const [related, setRelated] = useState<{ path: string; dependedOnBy: string[]; tests: string[] } | null>(null);

  const loadLinks = useCallback(async () => {
    try { setLinks((await existingSourceApi.list()).links); setError(null); } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadLinks(); }, [loadLinks]);

  const loadChoices = async () => {
    setBusy('repositories');
    try {
      const r = await existingSourceApi.repositories();
      setChoices(r.repositories); setAccount(r.account.login); setError(null);
    } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  const link = async () => {
    if (!selected) return;
    setBusy('link');
    try {
      const { binding } = await existingSourceApi.link({ repositoryId: selected.id, ...(branch.trim() ? { branch: branch.trim() } : {}) });
      setSelected(null); setBranch(''); setChoices(null);
      await loadLinks();
      await open(binding);
    } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  const importZip = async (file: File | undefined) => {
    if (!file) return;
    setBusy('zip'); setImportNote(null);
    try {
      const { binding, report } = await existingSourceApi.importZip(file, file.name);
      const skipped = Object.values(report.refused).reduce((n, c) => n + c, 0);
      setImportNote(`Imported ${report.entries} files; ${report.listedOnly} are listed but not kept (credentials, binaries, dependencies, generated files)${skipped ? `; ${skipped} unsafe or unsupported entries were refused` : ''}.`);
      setError(null);
      await loadLinks();
      await open(binding);
    } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  const browse = async (binding: SourceBinding, path = '') => {
    setBrowseError(null); setFile(null);
    try { setListing(await existingSourceApi.directory(binding.id, path)); } catch (caught) { setListing(null); setBrowseError(existingSourceErrorMessage(caught)); await loadLinks(); }
  };

  const open = async (binding: SourceBinding) => {
    setBusy(binding.id); setActive(null); setListing(null); setFile(null); setBrowseError(null);
    try {
      const verified = await existingSourceApi.verify(binding.id);
      setActive(verified);
      await loadLinks();
      if (verified.binding.state === 'linked') await browse(verified.binding);
      else setBrowseError(verified.binding.stateReason || 'This link is not active.');
    } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  const openFile = async (path: string) => {
    if (!active) return;
    setBrowseError(null); setRelated(null);
    try { setFile(await existingSourceApi.file(active.binding.id, path)); } catch (caught) { setFile(null); setBrowseError(existingSourceErrorMessage(caught)); return; }
    if (map && (map.status === 'valid' || map.status === 'partial')) {
      try { const n = await existingSourceApi.neighborhood(active.binding.id, path); setRelated({ path, dependedOnBy: n.dependedOnBy, tests: n.tests }); } catch { /* the file is shown without its relations */ }
    }
  };

  const runMap = async (what: 'status' | 'build' | 'search' | 'locate') => {
    if (!active) return;
    const id = active.binding.id;
    setBusy(`map-${what}`); setMapError(null);
    try {
      if (what === 'status') setMap(await existingSourceApi.indexStatus(id));
      if (what === 'build') {
        const built = await existingSourceApi.buildIndex(id);
        setMapNote(built.metrics.kind === 'reused' ? 'The code map was already current; nothing was read again.' : `Read ${built.metrics.blobFetches} files (${Math.round(built.metrics.bytesFetched / 1024)} KB) in ${built.metrics.durationMs} ms.`);
        setMap(await existingSourceApi.indexStatus(id));
      }
      if (what === 'search') setFound(await existingSourceApi.search(id, query.trim()));
      if (what === 'locate') setLocated(await existingSourceApi.locate(id, ask.trim()));
    } catch (caught) { setMapError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  // each time a link is opened, show whether a code map already exists for its commit
  useEffect(() => {
    setMap(null); setMapNote(null); setMapError(null); setFound(null); setLocated(null); setRelated(null); setQuery(''); setAsk('');
    const current = active?.binding;
    if (!current || current.state !== 'linked') return;
    let cancelled = false;
    existingSourceApi.indexStatus(current.id).then((s) => { if (!cancelled) setMap(s); }).catch(() => { /* the status stays unknown */ });
    return () => { cancelled = true; };
    // reset and re-check only when the link, its commit or its state changes, not on every refresh of the other fields of the binding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.binding.id, active?.binding.baseCommitSha, active?.binding.state]);

  const refresh = async () => {
    if (!active) return;
    setBusy('refresh');
    try { await existingSourceApi.refresh(active.binding.id); await open(active.binding); } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  const unlink = async (binding: SourceBinding) => {
    setBusy(binding.id);
    try { await existingSourceApi.unlink(binding.id); if (active?.binding.id === binding.id) { setActive(null); setListing(null); setFile(null); } await loadLinks(); } catch (caught) { setError(existingSourceErrorMessage(caught)); } finally { setBusy(null); }
  };

  const visibleChoices = useMemo(() => (choices ?? []).filter((c) => c.fullName.toLowerCase().includes(filter.trim().toLowerCase())), [choices, filter]);
  const crumbs = useMemo(() => (listing?.path ? listing.path.split('/') : []), [listing]);

  if (!EXISTING_SOURCE_ENABLED) {
    return <div className="xv-ws-empty-state"><AlertTriangle aria-hidden="true" /><strong>Editing an existing repository is not available yet.</strong></div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 text-sm" data-testid="existing-source-panel">
      <header>
        <h1 className="text-lg font-semibold">Existing repositories</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">Link a repository you already have on GitHub. Xroga reads it at an exact commit and never replaces it. Changes are made on an isolated copy and delivered as a draft pull request or a patch you review.</p>
      </header>

      {error ? <p role="alert" className="text-xs text-amber-400">{error}</p> : null}

      <section aria-label="Link a repository" className="space-y-2 rounded-lg border border-[var(--card-border)]/60 p-3">
        {choices === null ? (
          <button type="button" onClick={() => void loadChoices()} disabled={busy === 'repositories'} className="flex items-center gap-1.5 rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-60">
            {busy === 'repositories' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="h-3.5 w-3.5" aria-hidden="true" />} Choose a repository
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--muted)]">Repositories your GitHub account <strong>{account}</strong> can read.</p>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter repositories" aria-label="Filter repositories" className="w-full rounded border border-[var(--card-border)] bg-transparent px-2 py-1 text-xs" />
            <ul aria-label="Repositories" className="max-h-56 divide-y divide-[var(--card-border)]/40 overflow-y-auto rounded border border-[var(--card-border)]/60">
              {visibleChoices.length === 0 ? <li className="p-2 text-xs text-[var(--muted)]">No repositories match.</li> : visibleChoices.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setSelected(c); setBranch(''); }} aria-pressed={selected?.id === c.id} className={cn('flex w-full items-center gap-2 p-2 text-left text-xs hover:bg-[var(--accent)]/5', selected?.id === c.id && 'bg-[var(--accent)]/10')}>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.fullName}</span>
                    {c.private ? <span className="flex items-center gap-0.5 text-[10px] text-[var(--muted)]"><Lock className="h-3 w-3" aria-hidden="true" />private</span> : null}
                    {c.archived ? <span className="text-[10px] text-amber-400">archived</span> : null}
                    <span className="text-[10px] text-[var(--muted)]">{c.canWrite ? 'can push' : 'read only'}</span>
                  </button>
                </li>
              ))}
            </ul>
            {selected ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">{selected.fullName}</span>
                <label className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={selected.defaultBranch} aria-label="Branch" className="w-40 rounded border border-[var(--card-border)] bg-transparent px-2 py-1" />
                </label>
                <button type="button" onClick={() => void link()} disabled={busy === 'link'} className="rounded-lg bg-[var(--foreground)] px-3 py-1 font-medium text-[var(--background)] disabled:opacity-60">{busy === 'link' ? 'Linking' : 'Link this repository'}</button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section aria-label="Import a ZIP" className="space-y-1 rounded-lg border border-[var(--card-border)]/60 p-3">
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">Or import a ZIP of an existing project</span>
          <input type="file" accept=".zip,application/zip" disabled={busy === 'zip'} onChange={(e) => { void importZip(e.target.files?.[0]); e.target.value = ''; }} className="text-[11px]" aria-label="ZIP file" />
        </label>
        <p className="text-[11px] text-[var(--muted)]">Up to 10 MB. Xroga reads it, never writes back to it, and never keeps credentials or binaries from it.</p>
        {importNote ? <p className="text-[11px] text-[var(--muted)]" data-testid="existing-source-import-note">{importNote}</p> : null}
      </section>

      <section aria-label="Linked repositories">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Linked</h2>
        {loading ? <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading</div>
          : links.length === 0 ? <p className="text-xs text-[var(--muted)]">Nothing linked yet.</p> : (
            <ul className="divide-y divide-[var(--card-border)]/40 rounded-lg border border-[var(--card-border)]/60">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 p-2.5">
                  <button type="button" onClick={() => void open(l)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-medium">{l.repositoryFullName}</span>
                    <span className="block text-[11px] text-[var(--muted)]">{l.originKind === 'archive' ? <>ZIP import <code>{short(l.baseCommitSha)}</code></> : <>{l.baseBranch} at <code>{short(l.baseCommitSha)}</code> · account {l.accountLogin}</>}</span>
                  </button>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px]', STATE_TONE[l.state])}>{STATE_LABEL[l.state]}</span>
                  <button type="button" onClick={() => void unlink(l)} disabled={busy === l.id} className="rounded p-1.5 text-[var(--muted)] hover:text-red-400 disabled:opacity-50" aria-label={`Unlink ${l.repositoryFullName}`}><Unlink className="h-4 w-4" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
      </section>

      {active ? (
        <section aria-label="Repository details" className="space-y-3 rounded-lg border border-[var(--card-border)]/60 p-3" data-testid="existing-source-detail">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{active.binding.repositoryFullName}</h2>
            <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', STATE_TONE[active.binding.state])}>{STATE_LABEL[active.binding.state]}</span>
            <button type="button" onClick={() => void open(active.binding)} className="ml-auto rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]" aria-label="Verify the link again"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
            <div><dt className="inline text-[var(--muted)]">Repository id </dt><dd className="inline">{active.binding.providerRepositoryId}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Connected account </dt><dd className="inline">{active.binding.accountLogin}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Branch </dt><dd className="inline">{active.binding.baseBranch}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Linked commit </dt><dd className="inline"><code>{active.binding.baseCommitSha}</code></dd></div>
            <div><dt className="inline text-[var(--muted)]">Access </dt><dd className="inline">{active.binding.permissions.pull ? 'read' : 'none'}{active.writable ? ', write' : ', no write'}{active.binding.repositoryArchived ? ', archived' : ''}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Code index </dt><dd className="inline">{active.binding.indexStatus.replace(/_/g, ' ')}</dd></div>
          </dl>
          {active.head?.moved ? (
            <p className="flex flex-wrap items-center gap-2 text-[11px] text-amber-400">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> {active.binding.baseBranch} has moved to <code>{short(active.head.commitSha)}</code>. Xroga keeps reading <code>{short(active.binding.baseCommitSha)}</code> until you move it.
              <button type="button" onClick={() => void refresh()} disabled={busy === 'refresh'} className="rounded border border-amber-400/40 px-2 py-0.5 disabled:opacity-60">Use the new commit</button>
            </p>
          ) : null}
          {active.binding.state !== 'linked' ? <p role="alert" className="text-[11px] text-red-400">{active.binding.stateReason || 'This link is not active.'}</p> : null}
          {browseError ? <p role="alert" className="text-[11px] text-amber-400">{browseError}</p> : null}

          {listing ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div>
                <nav aria-label="Path" className="mb-1 flex flex-wrap items-center gap-0.5 text-[11px]">
                  <button type="button" onClick={() => void browse(active.binding)} className="underline">root</button>
                  {crumbs.map((c, i) => (<span key={i} className="flex items-center gap-0.5"><ChevronRight className="h-3 w-3" aria-hidden="true" /><button type="button" onClick={() => void browse(active.binding, crumbs.slice(0, i + 1).join('/'))} className="underline">{c}</button></span>))}
                </nav>
                {!listing.complete ? <p className="mb-1 text-[11px] text-amber-400">This repository is too large to list completely ({listing.partialReason?.replace(/_/g, ' ')}). Missing files are not proven absent.</p> : null}
                <ul aria-label="Files" className="max-h-80 divide-y divide-[var(--card-border)]/30 overflow-y-auto rounded border border-[var(--card-border)]/60">
                  {listing.entries.length === 0 ? <li className="p-2 text-[11px] text-[var(--muted)]">Empty.</li> : listing.entries.map((e) => (
                    <li key={e.path}>
                      <button type="button" disabled={e.sensitive || e.type === 'symlink' || e.type === 'submodule'} onClick={() => (e.type === 'directory' ? void browse(active.binding, e.path) : void openFile(e.path))} className="flex w-full items-center gap-2 p-1.5 text-left text-xs hover:bg-[var(--accent)]/5 disabled:opacity-60">
                        {e.type === 'directory' ? <Folder className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate">{e.name}</span>
                        {e.sensitive ? <span className="text-[10px] text-amber-400">credentials, never shown</span> : e.type === 'symlink' ? <span className="text-[10px] text-[var(--muted)]">symlink</span> : e.type === 'submodule' ? <span className="text-[10px] text-[var(--muted)]">submodule</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {listing.truncated ? <p className="mt-1 text-[11px] text-[var(--muted)]">Showing the first {listing.entries.length} entries.</p> : null}
              </div>
              <div className="min-w-0">
                {file ? (
                  <div data-testid="existing-source-file">
                    <p className="mb-1 truncate text-[11px] text-[var(--muted)]">{file.path} at <code>{short(file.commitSha)}</code>{file.redactions ? ` · ${file.redactions} secret${file.redactions === 1 ? '' : 's'} hidden` : ''}{file.truncated ? ' · shortened' : ''}</p>
                    <pre className="max-h-80 overflow-auto rounded border border-[var(--card-border)]/60 p-2 text-[11px] leading-snug"><code>{file.content}</code></pre>
                  </div>
                ) : <p className="text-[11px] text-[var(--muted)]">Choose a file to read it at the linked commit.</p>}
                {file && related?.path === file.path ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]" data-testid="existing-source-related">
                    Used by {related.dependedOnBy.length} file{related.dependedOnBy.length === 1 ? '' : 's'}; covered by {related.tests.length === 0 ? 'no test in the map' : related.tests.slice(0, 3).join(', ')}.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {active.binding.state === 'linked' ? (
            <div className="space-y-2 border-t border-[var(--card-border)]/40 pt-3" data-testid="existing-source-map">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Code map</h3>
                <span className="text-[11px]">{map ? map.status.replace(/_/g, ' ') : 'checking'}</span>
                <button type="button" onClick={() => void runMap('build')} disabled={busy === 'map-build'} className="ml-auto rounded border border-[var(--card-border)] px-2 py-0.5 text-[11px] disabled:opacity-60">
                  {busy === 'map-build' ? 'Building' : map && (map.status === 'valid' || map.status === 'partial') ? 'Check the map' : 'Build the map'}
                </button>
              </div>
              {map ? <p className="text-[11px] text-[var(--muted)]">{map.reason}{map.filesIndexed !== null ? ` ${map.filesIndexed} files indexed.` : ''}</p> : null}
              {map?.status === 'partial' ? <p className="text-[11px] text-amber-400">The map is partial. A missing result does not prove the code is absent.</p> : null}
              {mapNote ? <p className="text-[11px] text-[var(--muted)]">{mapNote}</p> : null}
              {mapError ? <p role="alert" className="text-[11px] text-amber-400">{mapError}</p> : null}
              {map && (map.status === 'valid' || map.status === 'partial') ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <form onSubmit={(e) => { e.preventDefault(); if (query.trim().length >= 2) void runMap('search'); }} className="space-y-1">
                    <label className="block text-[11px] text-[var(--muted)]" htmlFor="map-search">Find a symbol or file</label>
                    <div className="flex gap-1"><input id="map-search" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 rounded border border-[var(--card-border)] bg-transparent px-2 py-1 text-xs" /><button type="submit" disabled={query.trim().length < 2 || busy === 'map-search'} className="rounded border border-[var(--card-border)] px-2 text-[11px] disabled:opacity-50">Search</button></div>
                    {found ? (
                      <ul aria-label="Search results" className="max-h-40 divide-y divide-[var(--card-border)]/30 overflow-y-auto rounded border border-[var(--card-border)]/60 text-[11px]">
                        {found.results.length === 0 ? <li className="p-1.5 text-[var(--muted)]">No match{found.complete ? '' : ' in the indexed part'}.</li> : found.results.map((r, i) => (
                          <li key={`${r.path}:${r.name ?? ''}:${i}`}><button type="button" onClick={() => void openFile(r.path)} className="block w-full truncate p-1.5 text-left hover:bg-[var(--accent)]/5">{r.name ? <><strong>{r.name}</strong> <span className="text-[var(--muted)]">{r.kind} in </span></> : null}{r.path}{r.line ? `:${r.line}` : ''}</button></li>
                        ))}
                      </ul>
                    ) : null}
                  </form>
                  <form onSubmit={(e) => { e.preventDefault(); if (ask.trim().length >= 3) void runMap('locate'); }} className="space-y-1">
                    <label className="block text-[11px] text-[var(--muted)]" htmlFor="map-locate">Where would this change go?</label>
                    <div className="flex gap-1"><input id="map-locate" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Describe the change" className="min-w-0 flex-1 rounded border border-[var(--card-border)] bg-transparent px-2 py-1 text-xs" /><button type="submit" disabled={ask.trim().length < 3 || busy === 'map-locate'} className="rounded border border-[var(--card-border)] px-2 text-[11px] disabled:opacity-50">Locate</button></div>
                    {located ? (
                      <div className="space-y-1 text-[11px]" data-testid="existing-source-located">
                        <p className="text-[var(--muted)]">Confidence {located.relevance.confidence}. About {located.passport.estimatedTokens} tokens of context instead of the whole repository.</p>
                        <ul aria-label="Likely files" className="divide-y divide-[var(--card-border)]/30 rounded border border-[var(--card-border)]/60">
                          {located.relevance.targets.length === 0 ? <li className="p-1.5 text-[var(--muted)]">No file stands out. Name a function, a file or an error.</li> : located.relevance.targets.map((t) => (
                            <li key={t.path} className="p-1.5"><button type="button" onClick={() => void openFile(t.path)} className="block w-full truncate text-left">{t.path}</button><span className="text-[var(--muted)]">{t.reasons.slice(0, 2).join('; ')}</span></li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </form>
                </div>
              ) : null}
            </div>
          ) : null}

          {active.binding.state === 'linked' ? <ChangeWorkbench binding={active.binding} /> : null}
        </section>
      ) : null}
    </div>
  );
}
