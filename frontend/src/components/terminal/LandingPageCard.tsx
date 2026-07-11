'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { normalizeBuildFiles } from '@/lib/normalizeBuildSource';
import { auditLandingSite, LANDING_UPDATE_SUGGESTIONS } from '@/lib/siteHealthAudit';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { PostBuildDashboard } from './PostBuildDashboard';

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
  const [autoDeploying, setAutoDeploying] = useState(false);
  const [pushingGithub, setPushingGithub] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [githubPushed, setGithubPushed] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(data.html ?? '');
  const [previewCss, setPreviewCss] = useState(data.css ?? '');
  const [previewJs, setPreviewJs] = useState(data.js ?? '');
  const pushAttempted = useRef(false);
  const autoDeployAttempted = useRef(false);

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

  const liveUrl =
    (vercelUrl && vercelVerified ? vercelUrl : null) ??
    (netlifyUrl && netlifyVerified ? netlifyUrl : null) ??
    (data.deployUrl && data.deployVerified ? data.deployUrl : null);

  useEffect(() => {
    if (autoDeployAttempted.current || liveUrl || !normalized.html.trim()) return;
    autoDeployAttempted.current = true;
    setAutoDeploying(true);
    setStatusNote('Auto-deploying to Vercel + Cloudflare CDN…');

    void api.github
      .redeployPreview({
        html: normalized.html,
        css: normalized.css,
        js: normalized.js,
        platform: 'vercel',
        projectSlug,
      })
      .then((result) => {
        const url = result.vercel?.deployUrl || result.deployUrl;
        const verified = result.vercel?.deployVerified ?? result.deployVerified;
        if (url) {
          setVercelUrl(url);
          setVercelVerified(Boolean(verified));
          setStatusNote(verified ? null : 'Live URL created — verifying SSL…');
          onPreviewUpdate?.({
            ...data,
            html: normalized.html,
            css: normalized.css,
            js: normalized.js,
            vercelPreviewUrl: url,
            deployUrl: url,
            deployVerified: Boolean(verified),
            siteAudit,
          });
        } else {
          setStatusNote(result.vercel?.error || 'Auto-deploy pending — preview available below.');
        }
      })
      .catch((err: Error) => {
        setStatusNote(`Auto-deploy: ${err.message?.slice(0, 120) || 'will retry on next build'}`);
        autoDeployAttempted.current = false;
      })
      .finally(() => setAutoDeploying(false));
  }, [liveUrl, normalized.html, normalized.css, normalized.js, projectSlug, data, onPreviewUpdate, siteAudit]);

  function handleFixIssue(prompt: string) {
    setPrompt(`Update my live website: ${prompt}`);
    void submit();
  }

  function handleSuggestion(text: string) {
    setPrompt(`Update my live website: ${text}`);
    void submit();
  }

  return (
    <PostBuildDashboard
      data={data}
      projectName={projectName}
      pages={pages}
      designTheme={designTheme}
      resolvedRepoName={resolvedRepoName}
      githubFilesUrl={githubFilesUrl}
      liveUrl={liveUrl}
      autoDeploying={autoDeploying}
      githubPushed={githubPushed}
      statusNote={statusNote}
      pushingGithub={pushingGithub}
      normalized={normalized}
      siteAudit={siteAudit}
      updateSuggestions={updateSuggestions}
      onFixIssue={handleFixIssue}
      onSuggestion={handleSuggestion}
    />
  );
}
