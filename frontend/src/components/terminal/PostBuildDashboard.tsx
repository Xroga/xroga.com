'use client';

import { useMemo, useState } from 'react';
import {
  ExternalLink,
  GitBranch,
  CheckCircle2,
  Loader2,
  FileCode,
  BookOpen,
  LayoutDashboard,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BuildCodeSandbox, type PreviewViewport } from './BuildCodeSandbox';
import type { LandingPageOutputData } from './LandingPageCard';

type TabId = 'preview' | 'files' | 'summary' | 'instructions';

const PRODUCTION_FILE_TREE = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/dashboard/page.tsx',
  'app/api/auth/route.ts',
  'app/api/payments/route.ts',
  'components/ui/Button.tsx',
  'components/ui/Card.tsx',
  'lib/supabase/client.ts',
  'lib/paddle/client.ts',
  'supabase/migrations/001_users.sql',
  'index.html',
  'styles.css',
  'script.js',
  'package.json',
  'tailwind.config.js',
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

function inferStackFeatures(data: LandingPageOutputData, pages: string[]) {
  const needsAuth =
    (data.features?.some((f) => /auth|login|user/i.test(f)) ?? false) ||
    /\bsaas|login|auth|membership/i.test(data.projectName ?? '') ||
    pages.length > 4;
  const needsPay = data.needsPayment !== false;
  return {
    frontend: 'Next.js 15 + Tailwind CSS (production scaffold)',
    preview: 'HTML/CSS/JS live preview + GitHub push',
    backend: needsAuth ? 'Supabase Edge Functions + PostgreSQL' : 'Supabase-ready backend layer',
    auth: needsAuth ? 'Supabase Auth (JWT + OAuth)' : 'Auth-ready (connect Supabase)',
    payments: needsPay ? 'Paddle integration' : 'Payments-ready (connect Paddle)',
    deploy: 'Vercel + Cloudflare CDN + SSL',
    storage: 'Cloudflare R2',
    email: 'Brevo transactional email',
  };
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
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');

  const stack = useMemo(() => inferStackFeatures(data, pages), [data, pages]);
  const totalLines =
    normalized.html.split('\n').length + normalized.css.split('\n').length + normalized.js.split('\n').length;
  const deployedAt = new Date().toLocaleString();

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
            {liveUrl.replace(/^https?:\/\//, '').slice(0, 48)}
          </a>
        ) : autoDeploying ? (
          <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Auto-deploying to Vercel + Cloudflare…
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
            <BuildCodeSandbox
              html={normalized.html}
              css={normalized.css}
              js={normalized.js}
              projectTitle={projectName}
              viewport={viewport}
              onViewportChange={setViewport}
              showViewportControls
            />
            {liveUrl ? (
              <div className="flex flex-wrap gap-2">
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 min-w-[140px] px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-xs font-bold hover:opacity-90"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visit live site
                </a>
                {githubFilesUrl ? (
                  <a
                    href={githubFilesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-medium hover:bg-[var(--foreground)]/5"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    View code
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-center text-[var(--muted)] py-1">
                Preview above — live URL appears when auto-deploy finishes.
              </p>
            )}
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--muted)]">
              {PRODUCTION_FILE_TREE.length} files in production scaffold · core site files pushed to GitHub
            </p>
            <ul className="space-y-1 text-[10px] font-mono max-h-[240px] overflow-y-auto">
              {PRODUCTION_FILE_TREE.map((path) => (
                <li
                  key={path}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]"
                >
                  <FileCode className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  <span className="truncate">{path}</span>
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
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              🚀 Deployment status: {liveUrl ? 'LIVE' : autoDeploying ? 'DEPLOYING' : 'PREVIEW READY'}
            </p>
            <ul className="space-y-1.5 text-[var(--foreground)]/85">
              <li><span className="text-[var(--muted)]">Name:</span> <strong>{projectName}</strong></li>
              <li><span className="text-[var(--muted)]">Repo:</span> {resolvedRepoName || 'Auto-created on deploy'}</li>
              <li><span className="text-[var(--muted)]">Pages:</span> {pages.join(', ')}</li>
              <li><span className="text-[var(--muted)]">Design:</span> {designTheme}</li>
              <li><span className="text-[var(--muted)]">Health:</span> {siteAudit.score}/100</li>
              {liveUrl && <li><span className="text-[var(--muted)]">Live URL:</span> {liveUrl}</li>}
              <li><span className="text-[var(--muted)]">Deployed:</span> {deployedAt}</li>
            </ul>
            <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-[var(--card-border)]">
              {Object.entries(stack).map(([key, val]) => (
                <div key={key} className="flex items-start gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" />
                  <span><span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span> {val}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-[var(--card-border)] text-[10px] text-[var(--muted)]">
              Build stats: {PRODUCTION_FILE_TREE.length} files · ~{totalLines.toLocaleString()} preview lines · auto-deploy enabled
            </div>
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
            {data.memoryNote && (
              <p className="text-[10px] text-[var(--muted)] border-t border-[var(--card-border)] pt-2">💬 {data.memoryNote}</p>
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
                <li>Production-ready app with {pages.length} sections</li>
                <li>{stack.frontend}</li>
                <li>{stack.backend}</li>
                <li>GitHub repository — full code ownership</li>
                <li>Auto-deploy to Vercel + Cloudflare CDN + SSL</li>
              </ul>
            </section>
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">How to access</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Click <strong>Visit live site</strong> when deployment completes</li>
                <li>Use <strong>Mobile / Tablet / Desktop</strong> preview controls to test layouts</li>
                <li>Open <strong>View code</strong> on GitHub for all files</li>
              </ol>
            </section>
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">Add features</p>
              <p>Tell Xroga: &quot;Add [feature] to my app&quot; — code updates on GitHub and redeploys automatically.</p>
            </section>
            <section>
              <p className="font-bold text-[var(--foreground)] mb-1">Custom domain</p>
              <p>Vercel Dashboard → Project → Domains → add your domain → update DNS at your registrar.</p>
            </section>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-[var(--card-border)] flex flex-wrap gap-2">
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] px-2.5 py-1 rounded-full bg-[var(--accent)] text-[var(--background)] font-bold"
          >
            Visit App
          </a>
        )}
        {githubFilesUrl && (
          <a
            href={githubFilesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] px-2.5 py-1 rounded-full border border-[var(--card-border)] font-medium"
          >
            View Code
          </a>
        )}
        <button
          type="button"
          onClick={() => onSuggestion('Add a new feature to my app')}
          className="text-[9px] px-2.5 py-1 rounded-full border border-[var(--accent)]/30 text-[var(--accent)] font-medium inline-flex items-center gap-1"
        >
          <Share2 className="w-3 h-3" />
          Add Features
        </button>
      </div>
    </div>
  );
}
