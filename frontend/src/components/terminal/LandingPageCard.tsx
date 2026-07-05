'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, GitBranch, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { normalizeBuildFiles } from '@/lib/normalizeBuildSource';
import { BuildCodeSandbox } from './BuildCodeSandbox';
import { auditLandingSite, LANDING_UPDATE_SUGGESTIONS } from '@/lib/siteHealthAudit';
import { useTerminalChat } from '@/context/TerminalChatContext';

export interface LandingPageOutputData {
  type: 'landing_page';
  html: string;
  css: string;
  js: string;
  heroImageUrl?: string;
  deployUrl: string;
  deployVerified?: boolean;
  githubRepoUrl?: string;
  githubRepoName?: string;
  projectName?: string;
  pages?: string[];
  features?: string[];
  designTheme?: string;
  needsPayment?: boolean;
  memoryNote?: string;
  summary?: string;
  vercelPreviewUrl?: string;
  netlifyPreviewUrl?: string;
  followUps?: string[];
  siteAudit?: {
    score: number;
    issues: Array<{ id: string; severity: string; area: string; message: string; fixPrompt: string }>;
    working: string[];
  };
}

interface LandingPageCardProps {
  data: LandingPageOutputData;
  onPreviewUpdate?: (output: LandingPageOutputData) => void;
}

export function LandingPageCard({ data, onPreviewUpdate }: LandingPageCardProps) {
  const [vercelUrl, setVercelUrl] = useState(data.vercelPreviewUrl ?? '');
  const [netlifyUrl, setNetlifyUrl] = useState(data.netlifyPreviewUrl ?? '');
  const [vercelVerified, setVercelVerified] = useState(false);
  const [netlifyVerified, setNetlifyVerified] = useState(false);
  const [deployingVercel, setDeployingVercel] = useState(false);
  const [deployingNetlify, setDeployingNetlify] = useState(false);
  const [pushingGithub, setPushingGithub] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [githubPushed, setGithubPushed] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(data.html ?? '');
  const [previewCss, setPreviewCss] = useState(data.css ?? '');
  const [previewJs, setPreviewJs] = useState(data.js ?? '');
  const pushAttempted = useRef(false);

  const selectedCtx = useMemo(() => getSelectedRepoContext(), []);
  const normalized = useMemo(
    () => normalizeBuildFiles(previewHtml, previewCss, previewJs),
    [previewHtml, previewCss, previewJs]
  );

  const resolvedRepoName =
    data.githubRepoName ??
    (data.githubRepoUrl ? data.githubRepoUrl.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '') : '') ??
    selectedCtx?.repo ??
    '';
  const resolvedGithubUrl =
    data.githubRepoUrl ??
    (resolvedRepoName ? `https://github.com/${resolvedRepoName}` : '');
  const resolvedBranch = selectedCtx?.branch ?? 'main';
  const githubFilesUrl = resolvedGithubUrl
    ? `${resolvedGithubUrl}/tree/${encodeURIComponent(resolvedBranch)}`
    : '';

  const projectName = data.projectName ?? data.githubRepoName?.replace(/^xroga-/, '') ?? 'Your Website';
  const pages = data.pages ?? ['Home', 'Menu', 'Gallery', 'Contact'];
  const designTheme = data.designTheme ?? 'Modern, clean design';
  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'xroga-build';

  const siteAudit = useMemo(
    () => auditLandingSite(normalized.html, normalized.css, normalized.js),
    [normalized.html, normalized.css, normalized.js]
  );

  const updateSuggestions = data.followUps?.length ? data.followUps : LANDING_UPDATE_SUGGESTIONS;
  const { setPrompt, submit } = useTerminalChat();

  useEffect(() => {
    setPreviewHtml(data.html ?? '');
    setPreviewCss(data.css ?? '');
    setPreviewJs(data.js ?? '');
    if (data.vercelPreviewUrl) {
      setVercelUrl(data.vercelPreviewUrl);
      setVercelVerified(true);
    }
    if (data.netlifyPreviewUrl) {
      setNetlifyUrl(data.netlifyPreviewUrl);
      setNetlifyVerified(true);
    }
    if (data.deployUrl && !data.vercelPreviewUrl && !data.netlifyPreviewUrl) {
      if (data.deployUrl.includes('vercel.app')) {
        setVercelUrl(data.deployUrl);
        setVercelVerified(Boolean(data.deployVerified));
      } else if (data.deployUrl.includes('netlify.app')) {
        setNetlifyUrl(data.deployUrl);
        setNetlifyVerified(Boolean(data.deployVerified));
      }
    }
  }, [data.html, data.css, data.js, data.vercelPreviewUrl, data.netlifyPreviewUrl, data.deployUrl, data.deployVerified]);

  useEffect(() => {
    if (pushAttempted.current || !resolvedRepoName || !normalized.html.trim()) return;
    pushAttempted.current = true;
    setPushingGithub(true);
    setStatusNote('Pushing index.html, styles.css, and script.js to your GitHub repo…');

    void api.github
      .pushBuild({
        html: normalized.html,
        css: normalized.css,
        js: normalized.js,
        repoName: resolvedRepoName,
        branch: resolvedBranch,
        projectSlug,
      })
      .then((result) => {
        setGithubPushed(true);
        setStatusNote(`Code saved to ${result.githubRepoName} — refresh GitHub to see your files.`);
        onPreviewUpdate?.({
          ...data,
          html: normalized.html,
          css: normalized.css,
          js: normalized.js,
          githubRepoUrl: result.githubRepoUrl,
          githubRepoName: result.githubRepoName,
        });
      })
      .catch((err: Error) => {
        setStatusNote(`GitHub push: ${err.message?.slice(0, 160) || 'failed'}. Preview still works below.`);
        pushAttempted.current = false;
      })
      .finally(() => setPushingGithub(false));
  }, [resolvedRepoName, resolvedBranch, normalized.html, normalized.css, normalized.js, projectSlug, data, onPreviewUpdate]);

  async function deployPlatform(platform: 'vercel' | 'netlify') {
    const setDeploying = platform === 'vercel' ? setDeployingVercel : setDeployingNetlify;
    setDeploying(true);
    setStatusNote(`Publishing to ${platform === 'vercel' ? 'Vercel' : 'Netlify'}…`);

    try {
      const result = await api.github.redeployPreview({
        html: normalized.html,
        css: normalized.css,
        js: normalized.js,
        platform,
        projectSlug,
      });

      const platformResult = platform === 'vercel' ? result.vercel : result.netlify;
      const url = platformResult?.deployUrl || result.deployUrl;
      const verified = platformResult?.deployVerified ?? result.deployVerified;
      const deployError = platformResult?.error;

      if (platform === 'vercel') {
        setVercelUrl(url);
        setVercelVerified(verified);
      } else {
        setNetlifyUrl(url);
        setNetlifyVerified(verified);
      }

      if (url && verified) {
        setStatusNote(null);
        onPreviewUpdate?.({
          ...data,
          html: normalized.html,
          css: normalized.css,
          js: normalized.js,
          vercelPreviewUrl: platform === 'vercel' ? url : vercelUrl || data.vercelPreviewUrl,
          netlifyPreviewUrl: platform === 'netlify' ? url : netlifyUrl || data.netlifyPreviewUrl,
          deployUrl: url,
          deployVerified: true,
          siteAudit,
        });
        window.open(url, '_blank', 'noopener,noreferrer');
      } else if (url) {
        setStatusNote(`${platform} URL created — verifying… Try opening again in a moment.`);
      } else {
        setStatusNote(
          deployError ||
            `${platform} deploy unavailable — check VERCEL_API_KEY or NETLIFY_ACCESS_TOKEN on server.`
        );
      }
    } catch (err) {
      setStatusNote(`${platform} deploy failed: ${(err as Error).message?.slice(0, 120) || 'unknown error'}`);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-white/10 bg-emerald-500/10">
        <p className="text-sm font-bold text-emerald-400">🎉 YOUR PROJECT IS LIVE!</p>
      </div>

      <div className="px-3 py-3 border-b border-white/10 bg-black/10">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]/70 mb-2">
          📌 Summary
        </p>
        <ul className="space-y-1.5 text-[11px] text-[var(--foreground)]/85">
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Name:</span>
            <span className="font-medium">{projectName}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Repo:</span>
            <span>{resolvedRepoName || 'Select repo in chatbar'}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Pages:</span>
            <span>{pages.join(', ')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Design:</span>
            <span>{designTheme}</span>
          </li>
        </ul>
        {data.memoryNote && !statusNote && (
          <p className="mt-2.5 text-[10px] text-[#93c5fd]/80 leading-snug border-t border-white/8 pt-2">
            💬 {data.memoryNote}
          </p>
        )}
        {(statusNote || pushingGithub) && (
          <p className="mt-2 text-[10px] text-[#93c5fd]/75 leading-snug flex items-center gap-1.5">
            {pushingGithub ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : null}
            {statusNote ?? 'Saving to GitHub…'}
          </p>
        )}
      </div>

      <BuildCodeSandbox
        html={normalized.html}
        css={normalized.css}
        js={normalized.js}
        projectTitle={projectName}
      />

      <div className="px-3 py-3 border-t border-white/10 bg-black/10 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]/70 mb-2">
            🔧 Site health — {siteAudit.score}/100
          </p>
          {siteAudit.working.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 mb-2">
              {siteAudit.working.map((w) => (
                <li key={w} className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                  ✓ {w}
                </li>
              ))}
            </ul>
          ) : null}
          {siteAudit.issues.length > 0 ? (
            <ul className="space-y-2">
              {siteAudit.issues.map((issue) => (
                <li
                  key={issue.id}
                  className="text-[10px] leading-snug p-2 rounded-lg bg-white/5 border border-white/8"
                >
                  <span
                    className={
                      issue.severity === 'error'
                        ? 'text-red-400'
                        : issue.severity === 'warn'
                          ? 'text-amber-400'
                          : 'text-[#93c5fd]'
                    }
                  >
                    {issue.area}: {issue.message}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(`Update my live website: ${issue.fixPrompt}`);
                      void submit();
                    }}
                    className="mt-1 block text-[9px] text-[#006aff] hover:underline text-left"
                  >
                    → Fix this for me
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-emerald-400/90">All core checks passed.</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]/70 mb-2">
            ✨ Suggested updates (edits your current GitHub files)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {updateSuggestions.slice(0, 6).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setPrompt(`Update my live website: ${suggestion}`);
                  void submit();
                }}
                className="text-[9px] px-2.5 py-1 rounded-full bg-[#006aff]/15 text-[#93c5fd] border border-[#006aff]/30 hover:bg-[#006aff]/25 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2 border-t border-white/10">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]/70">
          Hosted previews (deploy from generated code — no GitHub required)
        </p>

        {vercelUrl && vercelVerified ? (
          <a href={vercelUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#93c5fd]/90 truncate px-1" title={vercelUrl}>
            ▲ Vercel: {vercelUrl}
          </a>
        ) : null}
        {netlifyUrl && netlifyVerified ? (
          <a href={netlifyUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#93c5fd]/90 truncate px-1" title={netlifyUrl}>
            ◆ Netlify: {netlifyUrl}
          </a>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void deployPlatform('vercel')}
            disabled={deployingVercel}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-black/80 border border-white/15 transition-colors disabled:opacity-70"
          >
            {deployingVercel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            ▲ Vercel — Preview this site
          </button>
          <button
            type="button"
            onClick={() => void deployPlatform('netlify')}
            disabled={deployingNetlify}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00ad9f] text-white text-xs font-bold hover:bg-[#009688] transition-colors disabled:opacity-70"
          >
            {deployingNetlify ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            ◆ Netlify — Preview this site
          </button>
        </div>

        {githubFilesUrl ? (
          <a
            href={githubFilesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-white/5 text-[var(--foreground)]/80 text-xs font-medium hover:bg-white/10 transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            📂 View Files on GitHub
            <span className="text-[10px] opacity-70">
              ({resolvedRepoName}{githubPushed ? ' — pushed' : ''})
            </span>
          </a>
        ) : null}

        <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {['Homepage', 'Menu', data.needsPayment !== false ? 'Ordering' : null, 'Gallery', 'Contact', 'Responsive']
            .filter(Boolean)
            .map((step) => (
              <li key={step} className="flex items-center gap-1 text-[9px] text-emerald-400/90">
                <CheckCircle2 className="w-3 h-3" />
                {step}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
