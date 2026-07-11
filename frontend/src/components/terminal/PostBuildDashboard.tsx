'use client';

import { useState } from 'react';
import { ExternalLink, GitBranch, CheckCircle2, Loader2, FileCode, BookOpen, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BuildCodeSandbox } from './BuildCodeSandbox';
import type { LandingPageOutputData } from './LandingPageCard';

type TabId = 'preview' | 'files' | 'summary' | 'instructions';

const FILE_TREE = [
  { path: 'index.html', label: 'index.html' },
  { path: 'styles.css', label: 'styles.css' },
  { path: 'script.js', label: 'script.js' },
];

interface PostBuildDashboardProps {
  data: LandingPageOutputData;
  projectName: string;
  pages: string[];
  designTheme: string;
  resolvedRepoName: string;
  githubFilesUrl: string;
  liveUrl: string | null;
  autoDeploying: boolean;
  githubPushed: boolean;
  statusNote: string | null;
  pushingGithub: boolean;
  normalized: { html: string; css: string; js: string };
  siteAudit: { score: number; issues: Array<{ id: string; severity: string; area: string; message: string; fixPrompt: string }>; working: string[] };
  updateSuggestions: string[];
  onFixIssue: (prompt: string) => void;
  onSuggestion: (prompt: string) => void;
}

export function PostBuildDashboard({
  data,
  projectName,
  pages,
  designTheme,
  resolvedRepoName,
  githubFilesUrl,
  liveUrl,
  autoDeploying,
  githubPushed,
  statusNote,
  pushingGithub,
  normalized,
  siteAudit,
  updateSuggestions,
  onFixIssue,
  onSuggestion,
}: PostBuildDashboardProps) {
  const [tab, setTab] = useState<TabId>('preview');

  const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'preview', label: 'Live Preview', icon: LayoutDashboard },
    { id: 'files', label: 'Code Files', icon: FileCode },
    { id: 'summary', label: 'Summary', icon: CheckCircle2 },
    { id: 'instructions', label: 'Instructions', icon: BookOpen },
  ];

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-[var(--card-border)] bg-[var(--accent)]/10 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[var(--accent)]">✅ Your project is complete!</p>
        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent)] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open live site
          </a>
        ) : autoDeploying ? (
          <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Deploying…
          </span>
        ) : null}
      </div>

      {(statusNote || pushingGithub) && (
        <p className="px-3 py-2 text-[10px] text-[var(--muted)] border-b border-[var(--card-border)] flex items-center gap-1.5">
          {pushingGithub ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : null}
          {statusNote ?? 'Saving to GitHub…'}
        </p>
      )}

      <div className="flex border-b border-[var(--card-border)] overflow-x-auto scrollbar-hide">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold whitespace-nowrap border-b-2 transition-colors',
              tab === id
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/5'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === 'preview' && (
          <div className="space-y-3">
            <BuildCodeSandbox html={normalized.html} css={normalized.css} js={normalized.js} projectTitle={projectName} />
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-xs font-bold hover:opacity-90"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Visit {liveUrl.replace(/^https?:\/\//, '').slice(0, 52)}
              </a>
            ) : (
              <div className="text-xs text-center text-[var(--muted)] py-2">Preview above — live URL appears when auto-deploy finishes.</div>
            )}
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--muted)]">
              {FILE_TREE.length} core files generated · pushed to GitHub when connected
            </p>
            <ul className="space-y-1.5 text-[11px] font-mono">
              {FILE_TREE.map(({ path, label }) => (
                <li key={path} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
                  <FileCode className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>{label}</span>
                  <span className="ml-auto text-[var(--muted)] text-[9px]">
                    {(path === 'index.html' ? normalized.html : path === 'styles.css' ? normalized.css : normalized.js).length.toLocaleString()} chars
                  </span>
                </li>
              ))}
            </ul>
            {githubFilesUrl ? (
              <a
                href={githubFilesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-[var(--card-border)] text-xs font-medium hover:bg-[var(--foreground)]/5"
              >
                <GitBranch className="w-3.5 h-3.5" />
                View full repository on GitHub {githubPushed ? '(pushed)' : ''}
              </a>
            ) : null}
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-3 text-[11px]">
            <ul className="space-y-1.5 text-[var(--foreground)]/85">
              <li><span className="text-[var(--muted)]">Name:</span> <strong>{projectName}</strong></li>
              <li><span className="text-[var(--muted)]">Repo:</span> {resolvedRepoName || 'Auto-created on deploy'}</li>
              <li><span className="text-[var(--muted)]">Pages:</span> {pages.join(', ')}</li>
              <li><span className="text-[var(--muted)]">Design:</span> {designTheme}</li>
              <li><span className="text-[var(--muted)]">Health:</span> {siteAudit.score}/100</li>
            </ul>
            <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-[var(--card-border)]">
              {['Frontend: HTML/CSS/JS', 'Auth: Supabase (when enabled)', 'Deploy: Vercel + Cloudflare', 'Payments: Paddle (when enabled)'].map(
                (line) => (
                  <div key={line} className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {line}
                  </div>
                )
              )}
            </div>
            {data.memoryNote && <p className="text-[10px] text-[var(--muted)] border-t border-[var(--card-border)] pt-2">💬 {data.memoryNote}</p>}
            {siteAudit.issues.length > 0 && (
              <ul className="space-y-2 pt-2">
                {siteAudit.issues.slice(0, 4).map((issue) => (
                  <li key={issue.id} className="p-2 rounded-lg border border-[var(--card-border)] text-[10px]">
                    {issue.area}: {issue.message}
                    <button type="button" onClick={() => onFixIssue(issue.fixPrompt)} className="block mt-1 text-[var(--accent)] hover:underline">
                      Fix this
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {updateSuggestions.slice(0, 5).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="text-[9px] px-2 py-1 rounded-full border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'instructions' && (
          <div className="space-y-3 text-[11px] text-[var(--muted)] leading-relaxed">
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">What was built</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Responsive website with {pages.length} sections</li>
                <li>Production-ready HTML, CSS, and JavaScript</li>
                <li>GitHub repository with your code (full ownership)</li>
                <li>Auto-deploy to Vercel with Cloudflare CDN + SSL</li>
              </ul>
            </section>
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">How to access</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Click <strong>Visit live site</strong> when deployment completes</li>
                <li>Or open the <strong>Live Preview</strong> tab to test locally</li>
                <li>View code on GitHub under the <strong>Code Files</strong> tab</li>
              </ol>
            </section>
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">Add features</p>
              <p>Tell Xroga: &quot;Add [feature] to my app&quot; — it will update your GitHub files and redeploy automatically.</p>
            </section>
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">Custom domain</p>
              <p>Connect your domain in Vercel Dashboard → Project → Domains, then update DNS records at your registrar.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
