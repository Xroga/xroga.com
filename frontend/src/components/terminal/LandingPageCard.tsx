'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { markRepoAnalysisStale } from '@/lib/repoAnalysisCache';
import { notifyGithubProjectSaved, notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { registerRepoSession } from '@/lib/repoSessionsIndex';
import { normalizeBuildFiles } from '@/lib/normalizeBuildSource';
import { hydrateLandingOutput } from '@/lib/hydrateLandingOutput';
import { auditLandingSite, LANDING_UPDATE_SUGGESTIONS } from '@/lib/siteHealthAudit';
import { readBuildPipelineState, writeBuildPipelineState } from '@/lib/buildPipelineState';
import { PostBuildDashboard } from './PostBuildDashboard';
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
  isUpdate?: boolean;
  updatedFiles?: string[];
  siteAudit?: {
    score: number;
    issues: Array<{ id: string; severity: string; area: string; message: string; fixPrompt: string }>;
    working: string[];
  };
  integratedAi?: Array<{
    id: string;
    name: string;
    freeTier: boolean;
    requiresApiKey: boolean;
    endpoint: string;
    signupUrl?: string;
    topUpUrl?: string;
    userGuidance: string;
    xrogaProvided?: boolean;
  }>;
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
  const pages = data.pages ?? ['Home'];
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

  useEffect(() => {
    if ((data.html?.length ?? 0) > 80) return;
    void hydrateLandingOutput(data).then((hydrated) => {
      if (!hydrated.html?.trim()) return;
      setPreviewHtml(hydrated.html);
      setPreviewCss(hydrated.css ?? '');
      setPreviewJs(hydrated.js ?? '');
      onPreviewUpdate?.(hydrated);
    });
  }, [data, onPreviewUpdate]);

  const liveUrl =
    (vercelUrl && vercelVerified ? vercelUrl : null) ??
    (netlifyUrl && netlifyVerified ? netlifyUrl : null) ??
    (data.deployUrl && data.deployVerified ? data.deployUrl : null);

  useEffect(() => {
    if (pipelineAttempted.current || !normalized.html.trim()) return;

    const cached = resolvedRepoName ? readBuildPipelineState(resolvedRepoName, resolvedBranch) : null;
    const alreadyPushed = data.githubPushConfirmed === true || cached?.githubPushed === true;
    const alreadyDeployed =
      Boolean(data.deployUrl && data.deployVerified) ||
      Boolean(data.vercelPreviewUrl) ||
      cached?.vercelDeployed === true;

    if (alreadyPushed) setGithubPushed(true);
    if (cached?.vercelUrl && !vercelUrl) {
      setVercelUrl(cached.vercelUrl);
      setVercelVerified(true);
    }
    if (alreadyPushed && (alreadyDeployed || liveUrl)) return;

    pipelineAttempted.current = true;

    async function runPipeline() {
      let pushed = alreadyPushed;

      if (!pushed && resolvedRepoName) {
        setPushingGithub(true);
        setStatusNote(`Pushing ${data.fileCount ?? 'project'} files to ${resolvedRepoName} (${resolvedBranch})…`);
        try {
          const result = await api.github.pushBuild({
            html: normalized.html,
            css: normalized.css,
            js: normalized.js,
            repoName: resolvedRepoName,
            branch: resolvedBranch,
            projectSlug,
            projectName,
            userPrompt: data.userPrompt ?? projectName,
          });
          pushed = true;
          setGithubPushed(true);
          writeBuildPipelineState(resolvedRepoName, resolvedBranch, {
            githubPushed: true,
            pushedAt: Date.now(),
          });
          markRepoAnalysisStale(resolvedRepoName);
          setStatusNote(`Code saved to ${result.githubRepoName} — open Projects to continue this repository.`);
          registerRepoSession({
            githubRepoName: result.githubRepoName,
            githubBranch: resolvedBranch,
            title: projectName.slice(0, 80),
            status: 'complete',
          });
          notifyGithubRepoContext(result.githubRepoName, resolvedBranch);
          void api.projects
            .create({
              name: projectName.slice(0, 120),
              type: 'website',
              github_repo_url: result.githubRepoUrl,
              github_repo_name: result.githubRepoName,
              github_branch: resolvedBranch,
              user_prompt: data.userPrompt ?? projectName,
            })
            .then((saved) => notifyGithubProjectSaved(saved.id))
            .catch((err) => console.warn('[LandingPageCard] project save', err));
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
          setStatusNote(`GitHub push: ${(err as Error).message?.slice(0, 160) || 'failed'}. Sandbox preview works below.`);
          pipelineAttempted.current = false;
        } finally {
          setPushingGithub(false);
        }
      } else if (pushed && resolvedRepoName) {
        writeBuildPipelineState(resolvedRepoName, resolvedBranch, { githubPushed: true });
      }

      if (alreadyDeployed || liveUrl) return;

      setAutoDeploying(true);
      setStatusNote((note) => note ?? 'Checking Vercel connection for live deploy…');
      try {
        const vercelStatus = await api.vercel.status();
        if (!vercelStatus.connected) {
          setStatusNote('Sandbox preview is ready below. Connect Vercel to publish a live URL on your account.');
          return;
        }

        setStatusNote('Deploying to your Vercel account…');
        const result = await api.vercel.deploy({
          html: normalized.html,
          css: normalized.css,
          js: normalized.js,
          projectSlug,
          projectName,
        });
        const url = result.deployUrl?.trim();
        if (url) {
          setVercelUrl(url);
          setVercelVerified(true);
          if (resolvedRepoName) {
            writeBuildPipelineState(resolvedRepoName, resolvedBranch, {
              vercelDeployed: true,
              vercelUrl: url,
            });
          }
          setStatusNote(null);
          onPreviewUpdate?.({
            ...data,
            html: normalized.html,
            css: normalized.css,
            js: normalized.js,
            vercelPreviewUrl: url,
            deployUrl: url,
            deployVerified: true,
            siteAudit,
          });
        } else {
          setStatusNote(result.error ?? 'Vercel deploy skipped — use sandbox preview below.');
        }
      } catch (err) {
        setStatusNote(`Live deploy: ${(err as Error).message?.slice(0, 120) || 'connect Vercel in Integrations'}. Sandbox preview works below.`);
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
    projectName,
    data,
    onPreviewUpdate,
    siteAudit,
    liveUrl,
    vercelUrl,
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
