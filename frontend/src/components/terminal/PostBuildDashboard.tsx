'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileCode,
  FolderTree,
  GitBranch,
  Lightbulb,
  Loader2,
  Rocket,
  Smartphone,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { FullscreenPreviewModal } from './FullscreenPreviewModal';
import { VercelDeployButton } from './VercelDeployButton';
import type { LandingPageOutputData } from './LandingPageCard';
import { XROGA_BUILD_PROCESS } from '@/lib/buildPlanningSteps';
import { scaffoldPathsForPrompt } from '@/lib/buildScaffoldPaths';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';

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
  onLiveUrl?: (url: string) => void;
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
    base.push('Payment-ready structure (Lemon Squeezy)');
  }
  base.push('GitHub code ownership', 'Live preview deployment');
  return base.slice(0, 10);
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
  onLiveUrl,
}: PostBuildDashboardProps) {
  const [behindOpen, setBehindOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(liveUrl);

  useEffect(() => {
    if (liveUrl) setDeployedUrl(liveUrl);
  }, [liveUrl]);

  const userRequest = data.userPrompt?.trim() || projectName;
  const isUpdate = Boolean(data.isUpdate);
  const updatedFiles = data.updatedFiles?.length ? data.updatedFiles : [];
  const builtSummary = useMemo(() => {
    if (isUpdate && data.summary?.includes('##')) {
      return null;
    }
    const pageList = pages.length ? pages.join(', ') : 'Home';
    const featureHint = data.features?.slice(0, 4).join(' · ');
    const parts = [`${projectName} with ${pageList} page${pages.length === 1 ? '' : 's'}.`, designTheme];
    if (featureHint) parts.push(featureHint);
    return parts.join(' ');
  }, [projectName, pages, designTheme, data.features, data.summary, isUpdate]);

  const features = useMemo(() => inferFeatures(data, pages), [data, pages]);
  const fileTree = useMemo(() => {
    if (data.generatedFiles?.length) return data.generatedFiles;
    const hint = [projectName, ...(data.features ?? []), ...(data.pages ?? [])].join(' ');
    return scaffoldPathsForPrompt(hint);
  }, [data.generatedFiles, data.features, data.pages, projectName]);
  const fileCount = data.fileCount ?? fileTree.length;
  const isExpoApp = useMemo(() => {
    const paths = fileTree.map((p) => p.toLowerCase());
    return (
      paths.some((p) => p === 'app.json' || p.endsWith('/app.json') || p === 'eas.json') ||
      paths.some((p) => p.includes('expo-router') || p.startsWith('app/')) ||
      /\b(expo|android|ios|react native|play store|app store)\b/i.test(
        [projectName, data.userPrompt, ...(data.features ?? [])].filter(Boolean).join(' ')
      )
    );
  }, [fileTree, projectName, data.userPrompt, data.features]);

  const isChromeExtension = useMemo(() => {
    const paths = fileTree.map((p) => p.toLowerCase());
    return (
      paths.some((p) => p === 'manifest.json') ||
      /\b(chrome extension|mv3|browser extension)\b/i.test(
        [projectName, data.userPrompt, ...(data.features ?? [])].filter(Boolean).join(' ')
      )
    );
  }, [fileTree, projectName, data.userPrompt, data.features]);

  const isElectronApp = useMemo(() => {
    const paths = fileTree.map((p) => p.toLowerCase());
    return (
      paths.some((p) => p === 'main.js' || p.startsWith('renderer/')) ||
      /\b(electron|desktop app|tauri)\b/i.test(
        [projectName, data.userPrompt, ...(data.features ?? [])].filter(Boolean).join(' ')
      )
    );
  }, [fileTree, projectName, data.userPrompt, data.features]);

  const missingItems: string[] = [];
  if (!githubPushed && !data.githubPushConfirmed) missingItems.push('Code not yet saved to GitHub — connect repo in chatbar');
  if (!liveUrl && !autoDeploying && !isChromeExtension && !isElectronApp) {
    missingItems.push('Live URL optional — connect Vercel or use sandbox preview below');
  }
  if (isExpoApp) {
    missingItems.push('Mobile: Connect Expo in Publish → one-click EAS on your account (you pay store/EAS fees)');
  }
  if (isChromeExtension) {
    if (data.chromeZipDownloadUrl) {
      missingItems.push('Chrome: download extension.zip from Releases → sideload or CWS (~$5 on your account)');
    } else {
      missingItems.push('Chrome: sideload from GitHub repo (free), or download zip from Releases / npm run zip');
    }
  }
  if (isElectronApp) {
    if (data.desktopActionsUrl || data.desktopReleasesUrl) {
      missingItems.push('Desktop: wait for Actions → download unsigned zip from GitHub Releases');
    } else {
      missingItems.push('Desktop: npm start locally, or open GitHub Actions / Releases for the unsigned zip');
    }
  }
  if (siteAudit.issues.some((i) => i.severity === 'critical')) {
    missingItems.push(`${siteAudit.issues.filter((i) => i.severity === 'critical').length} critical health issue(s)`);
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <div className="px-4 py-4 border-b border-[var(--card-border)] bg-gradient-to-br from-[var(--accent)]/12 to-transparent space-y-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-[var(--foreground)] leading-tight">
              {data.fullyShipped
                ? isUpdate
                  ? 'Update shipped'
                  : 'Project shipped'
                : data.buildOk === false
                  ? 'Build needs attention'
                  : isUpdate
                    ? 'Update built — ship incomplete'
                    : 'Built — ship incomplete'}
            </h2>
            <p className="text-sm font-semibold text-[var(--accent)] mt-0.5 truncate">{projectName}</p>
          </div>
        </div>

        {(statusNote || pushingGithub) && (
          <p className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
            {pushingGithub ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : null}
            {statusNote}
          </p>
        )}
      </div>

      <div className="p-4 space-y-5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              {isUpdate ? 'Your update request' : 'What you asked for'}
            </h3>
          </div>
          <p className="text-base font-semibold text-[var(--foreground)] leading-snug">{userRequest}</p>
        </section>

        {isUpdate && updatedFiles.length > 0 && (
          <section className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Files updated on GitHub
              </h3>
            </div>
            <ul className="space-y-1">
              {updatedFiles.map((f) => (
                <li key={f} className="flex items-center gap-2 text-[12px] font-mono text-[var(--foreground)]/90">
                  <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-[var(--muted)]">
              Only these files were patched — your repo stays intact. Sandbox preview below matches GitHub.
            </p>
          </section>
        )}

        {isUpdate && data.summary?.includes('##') ? (
          <section className="space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03] p-3">
            <FormattedAiMarkdown content={data.summary} />
          </section>
        ) : null}

        {!isUpdate && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">What we built</h3>
          </div>
          {builtSummary ? (
            <p className="text-sm text-[var(--foreground)]/90 leading-relaxed">{builtSummary}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-[var(--foreground)]/5 border border-[var(--card-border)]">
              <FileCode className="w-3 h-3 text-[var(--accent)]" />
              {fileCount} files
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-[var(--foreground)]/5 border border-[var(--card-border)]">
              <Wrench className="w-3 h-3 text-[var(--accent)]" />
              {designTheme}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-[var(--foreground)]/5 border border-[var(--card-border)]">
              Health {siteAudit.score}/100
            </span>
          </div>
        </section>
        )}

        {data.integratedAi && data.integratedAi.length > 0 && (
          <section className="space-y-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              AI integrations in your project
            </h3>
            <ul className="space-y-2 text-[11px]">
              {data.integratedAi.map((item) => (
                <li key={item.id} className="leading-snug">
                  <span className="font-semibold text-[var(--foreground)]">{item.name}</span>
                  {item.xrogaProvided ? (
                    <span className="ml-1 text-[9px] font-bold text-emerald-600">· XROGA ACTIVE</span>
                  ) : item.freeTier ? (
                    <span className="ml-1 text-[9px] font-bold text-emerald-600">· FREE</span>
                  ) : (
                    <span className="ml-1 text-[9px] font-bold text-amber-600">· PAID</span>
                  )}
                  <p className="text-[var(--muted)] mt-0.5">{item.userGuidance}</p>
                  {item.signupUrl && (
                    <a
                      href={item.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      {item.requiresApiKey ? 'Get API key' : 'Docs'}
                    </a>
                  )}
                  {item.topUpUrl && !item.freeTier && (
                    <>
                      {' · '}
                      <a
                        href={item.topUpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-600 hover:underline"
                      >
                        Top up credits
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[var(--muted)]">
              Add your own API keys anytime under Dashboard → Integrations.
            </p>
          </section>
        )}

        {/* Plan A: single preview lives in ProjectPreviewDock — avoid per-card tabs */}
        <section className="space-y-2">
          <p className="text-[11px] text-[var(--muted)]">
            {deployedUrl || liveUrl
              ? 'Live preview uses your Vercel domain in the project panel below.'
              : 'Sandbox preview is in the project panel below. Authorize Vercel once to publish on your own domain.'}
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Features</h3>
          </div>
          <ul className="space-y-1 text-[12px] text-[var(--foreground)]/88">
            {features.map((f) => (
              <li key={f} className="flex gap-2 items-start">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        {(missingItems.length > 0 || siteAudit.issues.length > 0 || (data.nextSteps && data.nextSteps.length > 0)) && (
          <section className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                {data.fullyShipped ? 'Next steps' : 'Missing or needs attention'}
              </h3>
            </div>
            <ul className="space-y-1.5 text-[11px]">
              {(data.nextSteps ?? []).map((item) => (
                <li key={item} className="flex gap-2 text-[var(--foreground)]/85">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
              {missingItems.map((item) => (
                <li key={item} className="flex gap-2 text-[var(--foreground)]/85">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
              {siteAudit.issues.slice(0, 3).map((issue) => (
                <li key={issue.id} className="flex gap-2 text-[var(--foreground)]/85">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    {issue.message}
                    <button
                      type="button"
                      onClick={() => onFixIssue(issue.fixPrompt)}
                      className="ml-1 text-[var(--accent)] hover:underline font-medium"
                    >
                      Fix
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Extra suggestions</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {updateSuggestions.slice(0, 5).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-2 pt-1">
          {data.chromeZipDownloadUrl ? (
            <a
              href={data.chromeZipDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-bold hover:opacity-90 shadow-sm transition-opacity"
            >
              <ExternalLink className="w-4 h-4" />
              Download extension.zip
            </a>
          ) : null}
          {data.chromeReleaseUrl && !data.chromeZipDownloadUrl ? (
            <a
              href={data.chromeReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-bold hover:border-[var(--accent)]/50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Chrome Releases
            </a>
          ) : null}
          {data.desktopZipDownloadUrl ? (
            <a
              href={data.desktopZipDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-bold hover:opacity-90 shadow-sm transition-opacity"
            >
              <ExternalLink className="w-4 h-4" />
              Download desktop zip
            </a>
          ) : null}
          {data.desktopReleasesUrl && !data.desktopZipDownloadUrl ? (
            <a
              href={data.desktopReleasesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-bold hover:opacity-90 shadow-sm transition-opacity"
            >
              <ExternalLink className="w-4 h-4" />
              Desktop Releases
            </a>
          ) : null}
          {data.easUrl ? (
            <a
              href={data.easUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-bold hover:border-[var(--accent)]/50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open EAS run
            </a>
          ) : null}
          {data.desktopActionsUrl && !data.desktopZipDownloadUrl ? (
            <a
              href={data.desktopActionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-bold hover:border-[var(--accent)]/50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              GitHub Actions
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-xs font-bold hover:opacity-90 shadow-sm transition-opacity"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          {(deployedUrl || liveUrl) && (
            <a
              href={(deployedUrl || liveUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-semibold hover:bg-[var(--foreground)]/5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Visit live site
            </a>
          )}
          {githubFilesUrl && (
            <a
              href={githubFilesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-semibold hover:bg-[var(--foreground)]/5 transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              View on GitHub
            </a>
          )}
          <VercelDeployButton
            html={normalized.html}
            css={normalized.css}
            js={normalized.js}
            projectSlug={projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'xroga-build'}
            projectName={projectName}
            onDeployed={(url) => {
              if (!url) return;
              setDeployedUrl(url);
              onLiveUrl?.(url);
            }}
          />
          <Link
            href="/dashboard/publish"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-xs font-semibold hover:bg-[var(--foreground)]/5 transition-colors"
          >
            {isExpoApp ? <Smartphone className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
            {isExpoApp ? 'Publish mobile (your stores)' : 'Publish setup'}
          </Link>
          <button
            type="button"
            onClick={() => setBehindOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--accent)]/35 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
          >
            {behindOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Behind the scenes
          </button>
        </div>

        {autoDeploying && (
          <p className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Deploying automatically…
          </p>
        )}

        {behindOpen && (
          <div className="pt-4 border-t border-[var(--card-border)] space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">File structure</h3>
            </div>
            <ul className="max-h-[200px] overflow-y-auto space-y-0.5 text-[10px] font-mono bg-[var(--foreground)]/[0.03] rounded-lg p-3 border border-[var(--card-border)]">
              {fileTree.map((path) => (
                <li key={path} className="flex items-center gap-1.5 py-0.5">
                  <FileCode className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  {path}
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">How we built it</h3>
            </div>
            <ol className="space-y-2 text-[11px] text-[var(--foreground)]/85">
              {XROGA_BUILD_PROCESS.map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span className="font-bold text-[var(--accent)] shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>

            {resolvedRepoName && (
              <p className="text-[10px] text-[var(--muted)] flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" />
                {githubPushed ? `Pushed to ${resolvedRepoName}` : `Target repo: ${resolvedRepoName}`}
              </p>
            )}
          </div>
        )}
      </div>

      <FullscreenPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        html={normalized.html}
        css={normalized.css}
        js={normalized.js}
        title={projectName}
        hideAppChrome
      />
    </div>
  );
}
