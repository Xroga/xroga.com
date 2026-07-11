'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { markRepoAnalysisStale } from '@/lib/repoAnalysisCache';
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
  githubPushConfirmed?: boolean;
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
  generatedFiles?: string[];
  fileCount?: number;
  userPrompt?: string;
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
  const pipelineAttempted = useRef(false);

  const selectedCtx = getSelectedRepoContext();
  const normalized = useMemo(
    () => normalizeBuildFiles(previewHtml, previewCss, previewJs),
    [previewHtml, previewCss, previewJs]
  );

  const resolvedRepoName =
    (data.githubPushConfirmed && data.githubRepoName) ? data.githubRepoName
    : selectedCtx?.repo ??
      data.githubRepoName ??
      (data.githubRepoUrl ? data.githubRepoUrl.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '') : '') ??
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
    if (data.githubPushConfirmed) {
      setGithubPushed(true);
    }
  }, [data.html, data.css, data.js, data.vercelPreviewUrl, data.netlifyPreviewUrl, data.deployUrl, data.deployVerified, data.githubPushConfirmed]);

  const liveUrl =
    (vercelUrl && vercelVerified ? vercelUrl : null) ??
    (netlifyUrl && netlifyVerified ? netlifyUrl : null) ??
    (data.deployUrl && data.deployVerified ? data.deployUrl : null);

  useEffect(() => {
    if (pipelineAttempted.current || !normalized.html.trim()) return;

    const alreadyLive =
      Boolean(data.deployUrl && data.deployVerified) ||
      Boolean(data.vercelPreviewUrl) ||
      Boolean(data.netlifyPreviewUrl);
    const alreadyPushed = data.githubPushConfirmed === true;

    if (alreadyLive && alreadyPushed) return;

    pipelineAttempted.current = true;

    async function runPipeline() {
      let pushed = alreadyPushed;

      if (!pushed && resolvedRepoName) {
        setPushingGithub(true);
        setStatusNote(`Pushing ${data.fileCount ?? 'full'} project files to ${resolvedRepoName} (${resolvedBranch})…`);
        try {
          const result = await api.github.pushBuild({
            html: normalized.html,
            css: normalized.css,
            js: normalized.js,
            repoName: resolvedRepoName,
            branch: resolvedBranch,
            projectSlug,
            projectName,
            userPrompt: projectName,
          });
          pushed = true;
          setGithubPushed(true);
          markRepoAnalysisStale(resolvedRepoName);
          setStatusNote(`Code saved to ${result.githubRepoName} — refresh GitHub to see your files.`);
          onPreviewUpdate?.({
            ...data,
            html: normalized.html,
            css: normalized.css,
            js: normalized.js,
            githubRepoUrl: result.githubRepoUrl,
            githubRepoName: result.githubRepoName,
            githubPushConfirmed: true,
            fileCount: result.fileCount,
            generatedFiles: result.generatedFiles,
          });
        } catch (err) {
          setStatusNote(`GitHub push: ${(err as Error).message?.slice(0, 160) || 'failed'}. Preview still works below.`);
          pipelineAttempted.current = false;
        } finally {
          setPushingGithub(false);
        }
      }

      if (alreadyLive || liveUrl) return;

      setAutoDeploying(true);
      setStatusNote((note) => note ?? 'Auto-deploying to Vercel + Cloudflare CDN…');
      try {
        const result = await api.github.redeployPreview({
          html: normalized.html,
          css: normalized.css,
          js: normalized.js,
          platform: 'vercel',
          projectSlug,
        });
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
      } catch (err) {
        setStatusNote(`Auto-deploy: ${(err as Error).message?.slice(0, 120) || 'will retry on next build'}`);
        pipelineAttempted.current = false;
      } finally {
        setAutoDeploying(false);
      }
    }

    void runPipeline();
  }, [
    normalized.html,
    normalized.css,
    normalized.js,
    resolvedRepoName,
    resolvedBranch,
    projectSlug,
    data,
    onPreviewUpdate,
    siteAudit,
    liveUrl,
  ]);

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
