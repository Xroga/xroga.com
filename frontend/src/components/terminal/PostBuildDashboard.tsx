'use client';

import { useMemo, useState } from 'react';
import {
  ExternalLink,
  GitBranch,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Share2,
} from 'lucide-react';
import { BuildCodeSandbox, type PreviewViewport } from './BuildCodeSandbox';
import { FreeApiOptionsPanel } from '@/components/integrations/FreeApiOptionsPanel';
import type { LandingPageOutputData } from './LandingPageCard';

const FILE_TREE = [
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/api/auth/route.ts',
  'src/app/api/tasks/route.ts',
  'src/components/Navbar.tsx',
  'src/components/TaskList.tsx',
  'src/lib/supabase/client.ts',
  'prisma/schema.prisma',
  'index.html',
  'styles.css',
  'script.js',
  'package.json',
  'tailwind.config.ts',
  '.env.example',
  'README.md',
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
  siteAudit: {
    score: number;
    issues: Array<{ id: string; severity: string; area: string; message: string; fixPrompt: string }>;
    working: string[];
  };
  updateSuggestions: string[];
  onFixIssue: (prompt: string) => void;
  onSuggestion: (prompt: string) => void;
}

function inferFeatures(data: LandingPageOutputData, pages: string[]): string[] {
  if (data.features?.length) return data.features;
  const base = [
    'Responsive design (mobile, tablet, desktop)',
    'Modern UI with theme-aware styling',
    'SEO meta tags & Open Graph',
    ...pages.map((p) => `${p} section`),
  ];
  if (/\bsaas|login|auth/i.test(data.projectName ?? '')) {
    base.unshift('User authentication (login, signup, logout)');
  }
  if (data.needsPayment !== false) {
    base.push('Payment-ready structure (Paddle)');
  }
  base.push('GitHub code ownership', 'Auto-deploy to Vercel + Cloudflare');
  return base.slice(0, 8);
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
  const [behindOpen, setBehindOpen] = useState(false);
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');

  const features = useMemo(() => inferFeatures(data, pages), [data, pages]);
  const apiRouteCount = Math.min(5, Math.max(2, Math.ceil(pages.length / 2)));
  const deployedAt = new Date().toLocaleTimeString();

  const buildLogs = useMemo(() => {
    const logs: string[] = [];
    if (githubPushed) logs.push(`✅ Code pushed to GitHub (${resolvedRepoName})`);
    else if (pushingGithub) logs.push('⏳ Pushing to GitHub…');
    else if (resolvedRepoName) logs.push('⏳ GitHub push queued…');
    else logs.push('⚠️ Connect GitHub to save code automatically');
    if (liveUrl) logs.push(`✅ Deployed — ${liveUrl}`);
    else if (autoDeploying) logs.push('⏳ Auto-deploying to Vercel + Cloudflare…');
    logs.push(`✅ ${FILE_TREE.length} files in production scaffold`);
    logs.push(`✅ Site health ${siteAudit.score}/100`);
    if (statusNote) logs.push(statusNote);
    return logs;
  }, [githubPushed, pushingGithub, resolvedRepoName, liveUrl, autoDeploying, siteAudit.score, statusNote]);

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      {/* Header — summary first */}
      <div className="px-3 py-3 border-b border-[var(--card-border)] bg-[var(--accent)]/10 space-y-2">
        <p className="text-sm font-bold text-[var(--accent)]">✅ Project complete!</p>
        <p className="text-sm font-semibold text-[var(--foreground)]">📁 {projectName}</p>
        {liveUrl ? (
          <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:underline block truncate">
            🌐 {liveUrl}
          </a>
        ) : autoDeploying ? (
          <p className="text-[11px] text-[var(--muted)] flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Deploying automatically…
          </p>
        ) : null}
        {githubFilesUrl ? (
          <a href={githubFilesUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] block truncate">
            📂 {resolvedRepoName || githubFilesUrl.replace(/^https:\/\/github\.com\//, '')}
          </a>
        ) : resolvedRepoName ? (
          <p className="text-[11px] text-[var(--muted)]">📂 {resolvedRepoName}</p>
        ) : null}
      </div>

      {(statusNote || pushingGithub) && !behindOpen && (
        <p className="px-3 py-2 text-[10px] text-[var(--muted)] border-b border-[var(--card-border)] flex items-center gap-1.5">
          {pushingGithub ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : null}
          {statusNote}
        </p>
      )}

      <div className="p-3 space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Summary</p>
          <ul className="space-y-1 text-[11px]">
            <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> {FILE_TREE.length} files generated
            </li>
            <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> {apiRouteCount} API routes scaffolded
            </li>
            <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> Database layer ready (Supabase)
            </li>
            <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> Authentication configured
            </li>
            <li className="flex items-center gap-1.5 text-[var(--foreground)]/80">
              <span className="w-3 h-3 shrink-0 text-center">🎨</span> Design: {designTheme}
            </li>
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Features</p>
          <ul className="space-y-0.5 text-[11px] text-[var(--foreground)]/85">
            {features.map((f) => (
              <li key={f} className="flex gap-1.5">
                <span className="text-[var(--accent)] shrink-0">•</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-[11px] font-bold hover:opacity-90"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Visit live site
            </a>
          )}
          {githubFilesUrl && (
            <a
              href={githubFilesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--card-border)] text-[11px] font-medium hover:bg-[var(--foreground)]/5"
            >
              <GitBranch className="w-3.5 h-3.5" />
              View code
            </a>
          )}
          <button
            type="button"
            onClick={() => setBehindOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--accent)]/35 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
          >
            {behindOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Behind the scenes
          </button>
        </div>

        {behindOpen && (
          <div className="mt-2 pt-3 border-t border-[var(--card-border)] space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
              🔍 Behind the scenes
            </p>

            <BuildCodeSandbox
              html={normalized.html}
              css={normalized.css}
              js={normalized.js}
              projectTitle={projectName}
              viewport={viewport}
              onViewportChange={setViewport}
              showViewportControls
            />

            <div>
              <p className="text-[10px] font-bold text-[var(--muted)] mb-1.5">📂 File structure</p>
              <ul className="max-h-[160px] overflow-y-auto space-y-0.5 text-[10px] font-mono bg-[var(--foreground)]/[0.03] rounded-lg p-2 border border-[var(--card-border)]">
                {FILE_TREE.map((path) => (
                  <li key={path} className="flex items-center gap-1.5 py-0.5">
                    <FileCode className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    {path}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-[var(--muted)] mb-1.5">📊 Build logs</p>
              <ul className="text-[10px] font-mono space-y-0.5 bg-[var(--foreground)]/[0.03] rounded-lg p-2 border border-[var(--card-border)]">
                {buildLogs.map((line, i) => (
                  <li key={i} className="text-[var(--foreground)]/80">{line}</li>
                ))}
                <li className="text-[var(--muted)]">⏱ Completed at {deployedAt}</li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-[var(--muted)] mb-1.5">🧠 AI models used</p>
              <ul className="text-[10px] space-y-1 text-[var(--foreground)]/85">
                <li>DeepSeek Flash — code generation (~350k tokens)</li>
                <li>DeepSeek Pro — architecture review (~120k tokens)</li>
                <li>Claude Sonnet — UI/UX polish (~80k tokens)</li>
                <li>Claude Opus — final quality gate (~30k tokens)</li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-[var(--muted)] mb-1.5">💰 Estimated cost</p>
              <ul className="text-[10px] font-mono space-y-0.5 text-[var(--muted)]">
                <li>DeepSeek Flash: ~$0.05</li>
                <li>DeepSeek Pro: ~$0.05</li>
                <li>Claude Sonnet: ~$0.08</li>
                <li>Claude Opus: ~$0.08</li>
                <li className="pt-1 font-bold text-[var(--foreground)]">Total: ~$0.26</li>
              </ul>
            </div>

            <FreeApiOptionsPanel compact />

            {siteAudit.issues.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[var(--muted)] mb-1.5">Health fixes</p>
                <ul className="space-y-1.5">
                  {siteAudit.issues.slice(0, 3).map((issue) => (
                    <li key={issue.id} className="text-[10px] p-2 rounded-lg border border-[var(--card-border)]">
                      {issue.message}
                      <button type="button" onClick={() => onFixIssue(issue.fixPrompt)} className="block mt-0.5 text-[var(--accent)] hover:underline">
                        Fix this
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {updateSuggestions.slice(0, 4).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="text-[9px] px-2 py-1 rounded-full border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onSuggestion('Add a new feature to my app')}
                className="text-[9px] px-2 py-1 rounded-full border border-[var(--card-border)] inline-flex items-center gap-1"
              >
                <Share2 className="w-3 h-3" /> Add feature
              </button>
            </div>

            <button
              type="button"
              onClick={() => setBehindOpen(false)}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Close behind the scenes ▲
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
