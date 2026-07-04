'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, GitBranch, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { buildInlinePreviewDocument } from '@/lib/landingPreview';
import { getSelectedRepoContext } from '@/lib/repoContext';

function deployHostLabel(url: string): string {
  if (!url?.trim()) return 'Preview pending';
  try {
    const host = new URL(url).hostname;
    if (host.includes('vercel')) return 'Vercel';
    if (host.includes('netlify')) return 'Netlify';
    return 'Live host';
  } catch {
    return 'Live host';
  }
}

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
}

interface LandingPageCardProps {
  data: LandingPageOutputData;
  onPreviewUpdate?: (output: LandingPageOutputData) => void;
}

export function LandingPageCard({ data, onPreviewUpdate }: LandingPageCardProps) {
  const [liveUrl, setLiveUrl] = useState(data.deployUrl ?? '');
  const [verified, setVerified] = useState(data.deployVerified === true);
  const [redeploying, setRedeploying] = useState(false);
  const [redeployNote, setRedeployNote] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState(data.html ?? '');
  const [previewCss, setPreviewCss] = useState(data.css ?? '');
  const [previewJs, setPreviewJs] = useState(data.js ?? '');
  const redeployAttempted = useRef(false);
  const filesLoaded = useRef(false);

  const selectedCtx = useMemo(() => getSelectedRepoContext(), []);
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

  const repoName = resolvedRepoName;

  useEffect(() => {
    setLiveUrl(data.deployUrl ?? '');
    setVerified(data.deployVerified === true);
    setPreviewHtml(data.html ?? '');
    setPreviewCss(data.css ?? '');
    setPreviewJs(data.js ?? '');
  }, [data.deployUrl, data.deployVerified, data.html, data.css, data.js]);

  useEffect(() => {
    if (filesLoaded.current || previewHtml.trim().length > 0 || !repoName) return;
    filesLoaded.current = true;
    void api.github.getBuildFiles(repoName).then((files) => {
      if (!files.html?.trim()) return;
      setPreviewHtml(files.html);
      setPreviewCss(files.css ?? '');
      setPreviewJs(files.js ?? '');
      onPreviewUpdate?.({
        ...data,
        html: files.html,
        css: files.css ?? '',
        js: files.js ?? '',
      });
    }).catch(() => {
      filesLoaded.current = false;
    });
  }, [repoName, previewHtml, data, onPreviewUpdate]);

  useEffect(() => {
    if (!repoName || verified || redeployAttempted.current) return;
    redeployAttempted.current = true;
    setRedeploying(true);
    setRedeployNote('Publishing live preview from your GitHub files…');

    void api.github
      .redeployPreview(repoName)
      .then((result) => {
        if (result.deployVerified && result.deployUrl) {
          setLiveUrl(result.deployUrl);
          setVerified(true);
          setRedeployNote(null);
          onPreviewUpdate?.({
            ...data,
            deployUrl: result.deployUrl,
            deployVerified: true,
          });
        } else {
          setRedeployNote('Preview ready in card — hosted link will appear when deploy finishes.');
        }
      })
      .catch(() => {
        setRedeployNote('Your site is saved on GitHub — preview shown below.');
      })
      .finally(() => setRedeploying(false));
  }, [repoName, verified, data, onPreviewUpdate]);

  const hostLabel = deployHostLabel(liveUrl);
  const projectName = data.projectName ?? data.githubRepoName?.replace(/^xroga-/, '') ?? 'Your Website';
  const pages = data.pages ?? ['Home', 'Menu', 'Gallery', 'Contact'];
  const features = data.features ?? ['Responsive design', data.designTheme ?? 'Modern theme'];
  const designTheme = data.designTheme ?? 'Modern, clean design';

  const inlinePreview = useMemo(
    () => buildInlinePreviewDocument(previewHtml, previewCss, previewJs),
    [previewHtml, previewCss, previewJs]
  );

  const hasInlinePreview = inlinePreview.trim().length > 50;
  const showHostedIframe = verified && Boolean(liveUrl.trim());

  async function handleOpenLivePreview() {
    if (verified && liveUrl) {
      window.open(liveUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const targetRepo = repoName || selectedCtx?.repo;
    if (!targetRepo) {
      setRedeployNote('Connect GitHub and select a repository in the chatbar, then try again.');
      return;
    }

    setRedeploying(true);
    setRedeployNote('Publishing live preview from GitHub…');
    try {
      const result = await api.github.redeployPreview(targetRepo);
      if (result.deployVerified && result.deployUrl) {
        setLiveUrl(result.deployUrl);
        setVerified(true);
        setRedeployNote(null);
        onPreviewUpdate?.({
          ...data,
          deployUrl: result.deployUrl,
          deployVerified: true,
          githubRepoUrl: resolvedGithubUrl || data.githubRepoUrl,
          githubRepoName: targetRepo,
        });
        window.open(result.deployUrl, '_blank', 'noopener,noreferrer');
      } else {
        setRedeployNote('Hosted link pending — styled preview is shown in the card above.');
      }
    } catch {
      setRedeployNote('Could not publish hosted link yet — styled preview is shown in the card above.');
    } finally {
      setRedeploying(false);
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
            <span className="text-[var(--muted)] shrink-0">Pages:</span>
            <span>{pages.join(', ')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Features:</span>
            <span>{features.join(', ')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Design:</span>
            <span>{designTheme}</span>
          </li>
        </ul>
        {data.memoryNote && (
          <p className="mt-2.5 text-[10px] text-[#93c5fd]/80 leading-snug border-t border-white/8 pt-2">
            💬 {data.memoryNote}
          </p>
        )}
        {redeployNote && (
          <p className="mt-2 text-[10px] text-[#93c5fd]/75 leading-snug">{redeployNote}</p>
        )}
      </div>

      {showHostedIframe ? (
        <iframe
          src={liveUrl}
          title="Live preview"
          className="w-full h-[min(280px,45vh)] border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : hasInlinePreview ? (
        <iframe
          srcDoc={inlinePreview}
          title="Live preview"
          className="w-full h-[min(280px,45vh)] border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="w-full h-[min(160px,35vh)] flex items-center justify-center bg-black/20 text-[11px] text-[var(--muted)] px-4 text-center">
          Loading preview from your saved build…
        </div>
      )}

      <div className="p-3 flex flex-col gap-2">
        {verified && liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#93c5fd]/90 truncate px-1"
            title={liveUrl}
          >
            🌐 Live URL: {liveUrl}
          </a>
        ) : null}

        <button
          type="button"
          onClick={() => void handleOpenLivePreview()}
          disabled={redeploying}
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-[#006aff] text-white text-sm font-bold hover:bg-[#0056d6] transition-colors shadow-lg shadow-[#006aff]/25 disabled:opacity-70"
        >
          {redeploying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          🔗 Open Live Preview
          {verified && liveUrl ? (
            <span className="text-[10px] font-normal opacity-80">({hostLabel})</span>
          ) : null}
        </button>

        {githubFilesUrl ? (
          <a
            href={githubFilesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-white/5 text-[var(--foreground)]/80 text-xs font-medium hover:bg-white/10 transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            📂 View Files on GitHub
            <span className="text-[10px] opacity-70">({resolvedRepoName})</span>
          </a>
        ) : (
          <p className="text-[10px] text-[var(--muted)] text-center px-2">
            Select a GitHub repo in the chatbar to save and view your code files.
          </p>
        )}
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
