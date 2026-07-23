'use client';

import { useMemo, useState } from 'react';
import {
  ChevronRight,
  Code2,
  ExternalLink,
  Eye,
  FileCode2,
  FilePlus,
  FolderTree,
  GitBranch,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Rocket,
  Search,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react';
import {
  useProjectWorkspaceStore,
  type DevWorkspaceTab,
  type ProjectFileEntry,
} from '@/store/useProjectWorkspaceStore';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';
import { cn } from '@/lib/utils';

const TABS: Array<{ id: DevWorkspaceTab; label: string; Icon: typeof FolderTree }> = [
  { id: 'files', label: 'Files', Icon: FolderTree },
  { id: 'code', label: 'Code', Icon: Code2 },
  { id: 'changes', label: 'Changes', Icon: GitBranch },
  { id: 'terminal', label: 'Terminal', Icon: TerminalIcon },
  { id: 'preview', label: 'Preview', Icon: Eye },
  { id: 'deploy', label: 'Deploy', Icon: Rocket },
];

function buildTree(files: ProjectFileEntry[]): Record<string, ProjectFileEntry[]> {
  const root: Record<string, ProjectFileEntry[]> = { '': [] };
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length === 1) {
      root[''] = [...(root[''] || []), f];
      continue;
    }
    const dir = parts.slice(0, -1).join('/');
    root[dir] = [...(root[dir] || []), f];
  }
  return root;
}

function PreviewPane({ viewport }: { viewport: 'mobile' | 'tablet' | 'desktop' }) {
  const html = useProjectWorkspaceStore((s) => s.html);
  const css = useProjectWorkspaceStore((s) => s.css);
  const js = useProjectWorkspaceStore((s) => s.js);
  const deployUrl = useProjectWorkspaceStore((s) => s.deployUrl);
  const lastUpdateAt = useProjectWorkspaceStore((s) => s.lastUpdateAt);
  const sandboxDoc = useMemo(
    () => (html?.trim() ? buildInlinePreviewDocument(html, css, js) : ''),
    [html, css, js]
  );
  const useLive = Boolean(deployUrl && /^https?:\/\//i.test(deployUrl));
  const width =
    viewport === 'mobile' ? 'max-w-[390px]' : viewport === 'tablet' ? 'max-w-[768px]' : 'max-w-none';

  if (!sandboxDoc && !useLive) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--muted)] p-6 text-center">
        No preview yet — submit a build prompt to generate the app.
      </div>
    );
  }

  return (
    <div className={cn('mx-auto h-full w-full bg-white', width)}>
      {useLive ? (
        <iframe
          key={`live-${deployUrl}-${lastUpdateAt ?? 0}`}
          title="Live Vercel preview"
          src={deployUrl!}
          className="h-full w-full min-h-[320px] border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <iframe
          key={lastUpdateAt ?? 'preview'}
          title="Sandbox preview"
          srcDoc={sandboxDoc}
          className="h-full w-full min-h-[320px] border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  );
}

export function DevWorkspacePanel({ className }: { className?: string }) {
  const workspaceOpen = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const setWorkspaceOpen = useProjectWorkspaceStore((s) => s.setWorkspaceOpen);
  const activeTab = useProjectWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useProjectWorkspaceStore((s) => s.setActiveTab);
  const projectFiles = useProjectWorkspaceStore((s) => s.projectFiles);
  const openFilePath = useProjectWorkspaceStore((s) => s.openFilePath);
  const openFilePaths = useProjectWorkspaceStore((s) => s.openFilePaths);
  const setOpenFilePath = useProjectWorkspaceStore((s) => s.setOpenFilePath);
  const closeFileTab = useProjectWorkspaceStore((s) => s.closeFileTab);
  const upsertFile = useProjectWorkspaceStore((s) => s.upsertFile);
  const deleteFile = useProjectWorkspaceStore((s) => s.deleteFile);
  const lastFileTrail = useProjectWorkspaceStore((s) => s.lastFileTrail);
  const terminalLog = useProjectWorkspaceStore((s) => s.terminalLog);
  const repo = useProjectWorkspaceStore((s) => s.repo);
  const branch = useProjectWorkspaceStore((s) => s.branch);
  const commitSha = useProjectWorkspaceStore((s) => s.commitSha);
  const deployUrl = useProjectWorkspaceStore((s) => s.deployUrl);
  const githubRepoUrl = useProjectWorkspaceStore((s) => s.githubRepoUrl);
  const status = useProjectWorkspaceStore((s) => s.status);
  const projectName = useProjectWorkspaceStore((s) => s.projectName);
  const lastChanges = useProjectWorkspaceStore((s) => s.lastChanges);

  const [query, setQuery] = useState('');
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [expanded, setExpanded] = useState(false);
  const [draftName, setDraftName] = useState('');

  const activeFile = projectFiles.find((f) => f.path === openFilePath) || null;
  const tree = useMemo(() => buildTree(projectFiles), [projectFiles]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectFiles;
    return projectFiles.filter(
      (f) => f.path.toLowerCase().includes(q) || f.content.toLowerCase().includes(q)
    );
  }, [projectFiles, query]);

  if (!workspaceOpen) {
    return (
      <button
        type="button"
        onClick={() => setWorkspaceOpen(true)}
        className="fixed right-3 top-1/2 z-40 -translate-y-1/2 rounded-l-lg border border-[var(--card-border)] bg-[var(--card)] px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)] shadow-md hover:text-[var(--foreground)] lg:right-0"
      >
        Workspace
      </button>
    );
  }

  return (
    <aside
      className={cn(
        'xv-dev-workspace flex flex-col border border-[var(--card-border)]/60 bg-[var(--card)]/80 backdrop-blur-md rounded-xl overflow-hidden min-h-[420px]',
        expanded && 'fixed inset-3 z-[180] min-h-0 rounded-2xl',
        className
      )}
    >
      <header className="flex items-center gap-1 border-b border-[var(--card-border)]/50 px-2 py-1.5 overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold shrink-0',
              activeTab === id
                ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label={expanded ? 'Exit full screen' : 'Full screen workspace'}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceOpen(false)}
            className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Close workspace"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'files' ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--card-border)]/40">
              <Search className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files…"
                className="flex-1 bg-transparent text-xs outline-none"
              />
              <button
                type="button"
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--foreground)]"
                title="New file"
                onClick={() => {
                  const name = draftName.trim() || `untitled-${Date.now()}.txt`;
                  upsertFile(name, '', 'generated');
                  setDraftName('');
                }}
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <RefreshCw className="h-3.5 w-3.5 text-[var(--muted)]" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px]">
              {filtered.length === 0 ? (
                <p className="text-[var(--muted)] p-3 text-center">No files yet</p>
              ) : (
                filtered.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setOpenFilePath(f.path)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--foreground)]/5',
                      openFilePath === f.path && 'bg-[var(--accent)]/10 text-[var(--accent)]'
                    )}
                  >
                    <FileCode2 className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{f.path}</span>
                    {f.flag && f.flag !== 'unchanged' ? (
                      <span className="text-[9px] uppercase text-[var(--muted)]">{f.flag[0]}</span>
                    ) : null}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(f.path);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          deleteFile(f.path);
                        }
                      }}
                      className="p-0.5 text-[var(--muted)] hover:text-rose-500"
                      aria-label={`Delete ${f.path}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </span>
                  </button>
                ))
              )}
              {Object.keys(tree).length === 0 ? null : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'code' ? (
          <div className="h-full flex flex-col min-h-0">
            <div className="flex items-center gap-1 border-b border-[var(--card-border)]/40 px-1 overflow-x-auto">
              {openFilePaths.map((p) => (
                <div
                  key={p}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-t-md px-2 py-1.5 text-[11px] font-mono',
                    openFilePath === p
                      ? 'bg-[var(--background)] text-[var(--foreground)]'
                      : 'text-[var(--muted)]'
                  )}
                >
                  <button type="button" onClick={() => setOpenFilePath(p)} className="truncate max-w-[140px]">
                    {p.split('/').pop()}
                  </button>
                  <button type="button" onClick={() => closeFileTab(p)} aria-label={`Close ${p}`}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {activeFile ? (
              <textarea
                key={activeFile.path}
                value={activeFile.content}
                onChange={(e) => upsertFile(activeFile.path, e.target.value, 'modified')}
                spellCheck={false}
                className="flex-1 w-full min-h-[280px] resize-none bg-[var(--background)]/60 p-3 font-mono text-[11px] leading-relaxed outline-none"
              />
            ) : (
              <p className="p-6 text-xs text-[var(--muted)] text-center">
                Open a file from the Files tab to inspect every line.
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'changes' ? (
          <div className="h-full overflow-y-auto p-3 space-y-3 font-mono text-[11px]">
            {lastChanges.length ? (
              <ul className="space-y-1 text-[var(--foreground)]/80">
                {lastChanges.map((c) => (
                  <li key={c} className="flex gap-2">
                    <ChevronRight className="h-3 w-3 text-[var(--accent)] shrink-0 mt-0.5" />
                    {c}
                  </li>
                ))}
              </ul>
            ) : null}
            {lastFileTrail.length === 0 ? (
              <p className="text-[var(--muted)] text-center py-8">No diffs yet</p>
            ) : (
              lastFileTrail.map((f) => (
                <div key={f.path} className="rounded-lg border border-[var(--card-border)]/50 p-2 space-y-1">
                  <p className="font-semibold flex items-center gap-2">
                    {f.path}
                    <span className="text-emerald-500">+{f.added}</span>
                    <span className="text-rose-400">−{f.removed}</span>
                  </p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-[var(--muted)]">
                    {(f.after || '').slice(0, 4000) || '(empty)'}
                  </pre>
                </div>
              ))
            )}
          </div>
        ) : null}

        {activeTab === 'terminal' ? (
          <div className="h-full overflow-y-auto bg-black/90 p-3 font-mono text-[11px] text-emerald-400/90 space-y-1">
            {terminalLog.length === 0 ? (
              <p className="text-white/40">$ waiting for real command output…</p>
            ) : (
              terminalLog.map((line, i) => <p key={`${i}-${line.slice(0, 24)}`}>{line}</p>)
            )}
          </div>
        ) : null}

        {activeTab === 'preview' ? (
          <div className="h-full flex flex-col min-h-0">
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--card-border)]/40">
              {(['mobile', 'tablet', 'desktop'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewport(v)}
                  className={cn(
                    'px-2 py-1 rounded text-[10px] font-bold uppercase',
                    viewport === v ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--muted)]'
                  )}
                >
                  {v}
                </button>
              ))}
              {deployUrl ? (
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-[#006aff]"
                >
                  <ExternalLink className="h-3 w-3" /> Live
                </a>
              ) : null}
            </div>
            <div className="flex-1 min-h-[280px] overflow-auto bg-[var(--foreground)]/5 p-2">
              <PreviewPane viewport={viewport} />
            </div>
          </div>
        ) : null}

        {activeTab === 'deploy' ? (
          <div className="h-full overflow-y-auto p-4 space-y-3 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Ship status</p>
            <dl className="space-y-2 font-mono">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Project</dt>
                <dd>{projectName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">GitHub</dt>
                <dd className="truncate text-right">
                  {githubRepoUrl ? (
                    <a href={githubRepoUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                      {repo || githubRepoUrl}
                    </a>
                  ) : (
                    repo || '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Branch</dt>
                <dd>{branch || 'main'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Commit</dt>
                <dd>{commitSha ? commitSha.slice(0, 8) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">State</dt>
                <dd className="inline-flex items-center gap-1">
                  {status === 'updating' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {status}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Vercel URL</dt>
                <dd className="truncate text-right">
                  {deployUrl ? (
                    <a href={deployUrl} target="_blank" rel="noreferrer" className="text-[#006aff]">
                      {deployUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-[10px] text-[var(--muted)] leading-relaxed pt-2">
              Change Vercel account / project under Integrations. Env var names only are shown — values stay
              server-side.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
