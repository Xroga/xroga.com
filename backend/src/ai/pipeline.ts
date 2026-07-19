import { randomUUID } from 'crypto';
import { convertUserRequest } from './converter.js';
import { MODELS, type ModelId } from './models.js';
import { chatCompletionStream, type ChatMessage } from './openaiCompat.js';
import {
  BUILDER_SYSTEM,
  CHAT_SYSTEM,
  incrementalUpdateContext,
  researchSynthesisPrompt,
} from './prompts.js';
import { assertHasQuota, recordUsage, usageToTokenUsage, type UsageSnapshot } from './quota.js';
import { formatResearchForPrompt, gatherResearch, type ResearchBundle } from './research.js';
import { isBuildPrompt, routePrompt, type RouteDecision } from './router.js';
import {
  extractProjectFiles,
  extractSiteFiles,
  siteLooksComplete,
} from './siteBuilder.js';
import {
  applyPatches,
  buildFileTrail,
  extractSearchReplacePatches,
  type ProjectFile,
} from './patches.js';
import { reviewBuildOutput } from './qa.js';
import { completeRun, createRun } from './runStore.js';
import {
  fetchBuildFilesFromGitHub,
  landingFilesFromOutput,
  pushBuildToGitHub,
  deployToAllPlatforms,
  isGitHubConnected,
} from '../services/integrations/githubDeploy.js';
import { getVercelToken } from '../services/integrations/vercelAuth.js';

export interface PipelineProgress {
  agent?: string;
  status?: string;
  message?: string;
  swarmStatusLabel?: string;
  swarmActivity?: string;
  swarmTodos?: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>;
  keepalive?: boolean;
}

export type ProgressFn = (event: PipelineProgress) => void;
export type DeltaFn = (delta: string) => void;

export interface BuildClientMeta {
  assistantMessageId?: string;
  userMessageId?: string;
  userPrompt?: string;
  buildContinuation?: boolean;
  buildOriginalPrompt?: string;
  buildUpdate?: boolean;
  githubTargetRepo?: string;
  githubTargetBranch?: string;
  priorSite?: {
    html: string;
    css?: string;
    js?: string;
    projectName?: string;
  };
}

export interface ChatPipelineResult {
  response: string;
  intent: string;
  usage: ReturnType<typeof usageToTokenUsage>;
  webSources?: ResearchBundle['sources'];
  modelId: ModelId;
  route: RouteDecision;
}

export interface BuildPipelineResult {
  runId: string;
  success: boolean;
  featureCategory: string;
  output: Record<string, unknown>;
  tokenUsage: ReturnType<typeof usageToTokenUsage>;
  followUps?: string[];
  route: RouteDecision;
}

const BUILDER_FALLBACKS: ModelId[] = [
  'kimi_k3',
  'glm_5_2',
  'deepseek_v4_pro',
  'grok_4_5',
  'grok_4_3',
  'deepseek_v4_flash',
];

function projectNameFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/^(build|create|make|generate|scaffold|develop)\s+(me\s+)?(a|an|the)?\s*/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return 'Xroga Build';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 48);
}

function parseClientMeta(raw: unknown): BuildClientMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const prior =
    m.priorSite && typeof m.priorSite === 'object'
      ? (m.priorSite as Record<string, unknown>)
      : null;
  return {
    assistantMessageId: typeof m.assistantMessageId === 'string' ? m.assistantMessageId : undefined,
    userMessageId: typeof m.userMessageId === 'string' ? m.userMessageId : undefined,
    userPrompt: typeof m.userPrompt === 'string' ? m.userPrompt : undefined,
    buildContinuation: m.buildContinuation === true,
    buildOriginalPrompt:
      typeof m.buildOriginalPrompt === 'string' ? m.buildOriginalPrompt : undefined,
    buildUpdate: m.buildUpdate === true,
    githubTargetRepo:
      typeof m.githubTargetRepo === 'string' && m.githubTargetRepo.includes('/')
        ? m.githubTargetRepo
        : undefined,
    githubTargetBranch:
      typeof m.githubTargetBranch === 'string' ? m.githubTargetBranch : undefined,
    priorSite:
      prior && typeof prior.html === 'string' && prior.html.trim().length > 40
        ? {
            html: prior.html.slice(0, 80_000),
            css: typeof prior.css === 'string' ? prior.css.slice(0, 40_000) : undefined,
            js: typeof prior.js === 'string' ? prior.js.slice(0, 40_000) : undefined,
            projectName:
              typeof prior.projectName === 'string' ? prior.projectName.slice(0, 120) : undefined,
          }
        : undefined,
  };
}

function changesFromTrail(
  trail: Array<{ path: string; added: number; removed: number }>,
  userPrompt: string,
): string[] {
  const bullets = trail.slice(0, 8).map((f) => {
    if (!f.added && !f.removed) return `Touched ${f.path}`;
    return `Updated ${f.path} (+${f.added} / −${f.removed})`;
  });
  return bullets.length ? bullets : [`Applied update: ${userPrompt.slice(0, 120)}`];
}

function filesToSite(files: ProjectFile[]): { html: string; css: string; js: string } {
  return {
    html: files.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'))?.content ?? '',
    css: files.find((f) => f.path === 'styles.css' || f.path.endsWith('.css'))?.content ?? '',
    js: files.find((f) => f.path === 'script.js' || (f.path.endsWith('.js') && !f.path.endsWith('.json')))
      ?.content ?? '',
  };
}

function mergeFileMaps(base: ProjectFile[], overlay: ProjectFile[]): ProjectFile[] {
  const map = new Map(base.map((f) => [f.path, f.content]));
  for (const f of overlay) map.set(f.path, f.content);
  return [...map.entries()].map(([path, content]) => ({ path, content }));
}

async function hydratePriorFiles(
  userId: string,
  meta?: BuildClientMeta,
): Promise<{ files: ProjectFile[]; projectName?: string } | null> {
  if (meta?.priorSite?.html?.trim()) {
    return {
      files: landingFilesFromOutput(
        meta.priorSite.html,
        meta.priorSite.css ?? '',
        meta.priorSite.js ?? '',
      ),
      projectName: meta.priorSite.projectName,
    };
  }
  if (meta?.githubTargetRepo?.includes('/')) {
    try {
      const files = await fetchBuildFilesFromGitHub(
        userId,
        meta.githubTargetRepo,
        meta.githubTargetBranch,
      );
      if (!files.some((f) => f.path === 'index.html' && f.content.trim())) return null;
      return { files };
    } catch (err) {
      console.warn('[pipeline] fetch prior from GitHub failed:', (err as Error).message);
    }
  }
  return null;
}

async function callBuilderStream(
  preferred: ModelId,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; onDelta?: DeltaFn },
): Promise<Awaited<ReturnType<typeof chatCompletionStream>>> {
  const order = [preferred, ...BUILDER_FALLBACKS.filter((m) => m !== preferred)];
  let lastErr: Error | null = null;
  for (const modelId of order) {
    try {
      return await chatCompletionStream(modelId, messages, {
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        onDelta: opts.onDelta,
      });
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[pipeline] ${modelId} stream failed:`, lastErr.message);
    }
  }
  throw lastErr ?? new Error('All AI models failed');
}

function todosForBuild(
  step: 'route' | 'research' | 'convert' | 'build' | 'qa' | 'push' | 'done',
) {
  const steps = [
    { id: 'route', label: 'Route request' },
    { id: 'research', label: 'Gather research' },
    { id: 'convert', label: 'Convert to builder brief' },
    { id: 'build', label: 'Generate product' },
    { id: 'qa', label: 'Review quality' },
    { id: 'push', label: 'Push & deploy' },
  ] as const;
  const order = ['route', 'research', 'convert', 'build', 'qa', 'push'] as const;
  const idx = step === 'done' ? order.length : order.indexOf(step);
  return steps.map((s, i) => ({
    id: s.id,
    label: s.label,
    status: (i < idx ? 'done' : i === idx ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));
}

function wantsResearch(prompt: string, _isUpdate: boolean): boolean {
  void _isUpdate;
  // New builds and updates: research when the user asks for current facts / news
  return /\b(research|latest|news|trends?|market|sources?|citations?|current|today|prices?)\b/i.test(
    prompt,
  );
}

/**
 * Light chat / research Q&A — Phase 1 lane (no site build).
 */
export async function runChatPipeline(opts: {
  userId: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onDelta?: DeltaFn;
}): Promise<ChatPipelineResult> {
  await assertHasQuota(opts.userId);
  const route = routePrompt(opts.prompt);

  if (isBuildPrompt(opts.prompt) && route.kind.startsWith('build')) {
    const err = new Error('USE_BUILD_PIPELINE');
    (err as Error & { code?: string }).code = 'USE_BUILD_PIPELINE';
    throw err;
  }

  let research: ResearchBundle | null = null;
  let researchBlock = '';
  if (route.useResearch) {
    research = await gatherResearch(opts.prompt);
    researchBlock = formatResearchForPrompt(research);
  }

  const historyMsgs: ChatMessage[] = (opts.history ?? [])
    .slice(-12)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 8000) }));

  const userContent = researchBlock
    ? `${opts.prompt}\n\n${researchBlock}`
    : route.kind === 'research' && researchBlock
      ? researchSynthesisPrompt(opts.prompt, researchBlock)
      : opts.prompt;

  const result = await callBuilderStream(
    route.builder,
    [{ role: 'system', content: CHAT_SYSTEM }, ...historyMsgs, { role: 'user', content: userContent }],
    {
      maxTokens: route.kind === 'research' ? 8192 : 4096,
      temperature: 0.5,
      onDelta: opts.onDelta,
    },
  );

  const usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);

  return {
    response: result.text,
    intent: route.kind,
    usage: usageToTokenUsage(usage),
    webSources: research?.sources,
    modelId: result.modelId,
    route,
  };
}

/**
 * Converter → Builder (+ QA + GitHub/Vercel) with real streaming and surgical updates.
 */
export async function runBuildPipeline(opts: {
  userId: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  projectId?: string;
  clientMeta?: BuildClientMeta | Record<string, unknown>;
  onProgress?: ProgressFn;
  onDelta?: DeltaFn;
  signal?: AbortSignal;
}): Promise<BuildPipelineResult> {
  const runId = randomUUID();
  const emit = (ev: PipelineProgress) => opts.onProgress?.(ev);
  const meta = parseClientMeta(opts.clientMeta);
  const userFacingPrompt = (meta?.userPrompt || opts.prompt).trim();

  createRun(opts.userId, userFacingPrompt, runId);
  await assertHasQuota(opts.userId);
  const route = routePrompt(opts.prompt);

  const prior = await hydratePriorFiles(opts.userId, meta);
  const isUpdate = Boolean(meta?.buildUpdate && prior?.files?.length);

  emit({
    agent: 'router',
    status: 'routing',
    message: isUpdate ? `Update mode · ${route.reason}` : route.reason,
    swarmStatusLabel: isUpdate ? 'Updating' : 'Routing',
    swarmActivity: isUpdate
      ? `Patching ${prior?.projectName || meta?.githubTargetRepo || 'project'}`
      : `Assigning ${MODELS[route.builder].label}`,
    swarmTodos: todosForBuild('route'),
  });

  let researchBlock = '';
  let research: ResearchBundle | null = null;
  const needResearch = route.useResearch || wantsResearch(opts.prompt, isUpdate);
  if (needResearch) {
    emit({
      agent: 'research',
      status: 'searching',
      message: 'Gathering sources…',
      swarmStatusLabel: 'Research',
      swarmActivity: 'Collecting sources',
      swarmTodos: todosForBuild('research'),
    });
    research = await gatherResearch(opts.prompt);
    researchBlock = formatResearchForPrompt(research);
  }

  emit({
    agent: 'converter',
    status: 'converting',
    message: isUpdate
      ? 'Converting update into a patch brief…'
      : 'Converting your request into a builder brief…',
    swarmStatusLabel: 'Briefing',
    swarmActivity: `Converter · ${MODELS[route.converter].label}`,
    swarmTodos: todosForBuild('convert'),
  });

  const converted = await convertUserRequest(
    isUpdate
      ? `INCREMENTAL UPDATE to existing project "${prior?.projectName || 'current site'}". Apply only this change using SEARCH/REPLACE patches: ${opts.prompt}`
      : opts.prompt,
    researchBlock || undefined,
  );
  let usage: UsageSnapshot = await recordUsage(
    opts.userId,
    'deepseek_v4_flash',
    converted.inputTokens,
    converted.outputTokens,
  );

  emit({
    agent: 'builder',
    status: 'building',
    message: isUpdate
      ? `Applying surgical update with ${MODELS[route.builder].label}…`
      : `Building with ${MODELS[route.builder].label}…`,
    swarmStatusLabel: isUpdate ? 'Patching' : 'Building',
    swarmActivity: MODELS[route.builder].tagline,
    swarmTodos: todosForBuild('build'),
  });

  const historyNote =
    opts.history?.length
      ? `\n\nRecent conversation context:\n${opts.history
          .slice(-6)
          .map((h) => `${h.role}: ${h.content.slice(0, 500)}`)
          .join('\n')}`
      : '';

  const updateBlock =
    isUpdate && prior ? `\n\n${incrementalUpdateContext(prior.files)}` : '';

  const builderUser = `${converted.instruction}${historyNote}${
    researchBlock ? `\n\n${researchBlock}` : ''
  }${updateBlock}\n\nOriginal user request:\n${opts.prompt}`;

  let result = await callBuilderStream(
    route.builder,
    [
      { role: 'system', content: BUILDER_SYSTEM },
      { role: 'user', content: builderUser },
    ],
    {
      maxTokens: 16384,
      temperature: isUpdate ? 0.3 : 0.45,
      onDelta: opts.onDelta,
    },
  );

  usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);

  // Resolve output files: patches first, then full files, then classic site
  let nextFiles: ProjectFile[] = [];
  let previousFiles: ProjectFile[] = prior?.files ?? [];
  let usedPatches = false;

  if (isUpdate && prior) {
    const patches = extractSearchReplacePatches(result.text);
    if (patches.length) {
      const applied = applyPatches(prior.files, patches);
      if (applied.applied.length) {
        nextFiles = applied.files;
        usedPatches = true;
      }
    }
  }

  if (!nextFiles.length) {
    const extracted = extractProjectFiles(result.text);
    if (extracted.length) {
      nextFiles = isUpdate && prior ? mergeFileMaps(prior.files, extracted) : extracted;
    }
  }

  if (!nextFiles.length) {
    const site = extractSiteFiles(result.text);
    if (site) {
      nextFiles = landingFilesFromOutput(site.html, site.css, site.js);
      if (isUpdate && prior) nextFiles = mergeFileMaps(prior.files, nextFiles);
    }
  }

  // Recovery: incomplete update → keep prior and retry once with stricter patch prompt
  if (isUpdate && prior) {
    const site = filesToSite(nextFiles);
    const bad =
      !nextFiles.length ||
      (site.html.trim().length > 0 &&
        site.html.length < (filesToSite(prior.files).html.length * 0.35) &&
        !usedPatches);

    if (bad || !nextFiles.length) {
      emit({
        agent: 'builder',
        status: 'recovering',
        message: 'Update incomplete — retrying with stricter patch instructions…',
        swarmStatusLabel: 'Recovering',
        swarmActivity: 'Retry patch',
        swarmTodos: todosForBuild('build'),
      });
      try {
        const retry = await callBuilderStream(
          route.builder,
          [
            { role: 'system', content: BUILDER_SYSTEM },
            {
              role: 'user',
              content: `${incrementalUpdateContext(prior.files)}\n\nUser update (MUST use SEARCH/REPLACE only):\n${userFacingPrompt}`,
            },
          ],
          { maxTokens: 8192, temperature: 0.2, onDelta: opts.onDelta },
        );
        usage = await recordUsage(
          opts.userId,
          retry.modelId,
          retry.inputTokens,
          retry.outputTokens,
        );
        result = retry;
        const patches = extractSearchReplacePatches(retry.text);
        if (patches.length) {
          const applied = applyPatches(prior.files, patches);
          if (applied.applied.length) {
            nextFiles = applied.files;
            usedPatches = true;
          }
        }
        if (!nextFiles.length) {
          const extracted = extractProjectFiles(retry.text);
          if (extracted.length) nextFiles = mergeFileMaps(prior.files, extracted);
        }
      } catch (err) {
        console.warn('[pipeline] recovery retry failed:', (err as Error).message);
      }
      if (!nextFiles.length) nextFiles = prior.files;
    }
  }

  const sitePreview = filesToSite(nextFiles);
  // Ensure classic trio exists for preview when only HTML-ish content
  if (!sitePreview.html.trim() && !isUpdate) {
    const site = extractSiteFiles(result.text);
    if (site && siteLooksComplete(site)) {
      nextFiles = landingFilesFromOutput(site.html, site.css, site.js);
    }
  }

  const finalSite = filesToSite(nextFiles);
  const hasPreviewable =
    finalSite.html.trim().length > 40 ||
    nextFiles.some((f) => f.path === 'package.json' || f.path.endsWith('.tsx'));

  if (!hasPreviewable && !nextFiles.length) {
    emit({
      agent: 'builder',
      status: 'complete',
      message: 'Response ready',
      swarmStatusLabel: 'Done',
      swarmActivity: 'Answer ready',
      swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
    });
    const chatOut = {
      type: 'chat',
      content: result.text,
      modelLabel: MODELS[result.modelId].label,
      webSources: research?.sources,
    };
    completeRun(runId, { output: chatOut, featureCategory: 'chat', tokenUsage: usageToTokenUsage(usage) });
    return {
      runId,
      success: true,
      featureCategory: route.kind === 'research' ? 'deep_research' : 'chat',
      output: chatOut,
      tokenUsage: usageToTokenUsage(usage),
      followUps: isBuildPrompt(opts.prompt)
        ? ['Try again with more detail', 'Ask for HTML/CSS/JS output']
        : ['Ask a follow-up', 'Start a full build'],
      route,
    };
  }

  // Ensure landing trio for sandbox when we have html
  if (finalSite.html.trim() && !nextFiles.some((f) => f.path === 'index.html')) {
    nextFiles = mergeFileMaps(
      nextFiles,
      landingFilesFromOutput(finalSite.html, finalSite.css, finalSite.js),
    );
  } else if (finalSite.html.trim()) {
    // Sync classic files from map
    const synced = landingFilesFromOutput(finalSite.html, finalSite.css, finalSite.js);
    nextFiles = mergeFileMaps(synced, nextFiles);
  }

  const projectName = isUpdate
    ? prior?.projectName || projectNameFromPrompt(opts.prompt)
    : projectNameFromPrompt(opts.prompt);

  previousFiles = prior?.files?.length
    ? prior.files
    : landingFilesFromOutput('', '', '');

  // QA review loop
  emit({
    agent: 'qa',
    status: 'reviewing',
    message: 'Reviewing build quality…',
    swarmStatusLabel: 'QA',
    swarmActivity: 'DeepSeek review',
    swarmTodos: todosForBuild('qa'),
  });
  const siteForQa = filesToSite(nextFiles);
  let qa = await reviewBuildOutput({
    prompt: userFacingPrompt,
    html: siteForQa.html,
    css: siteForQa.css,
    js: siteForQa.js,
    isUpdate,
  });
  if (qa.inputTokens || qa.outputTokens) {
    usage = await recordUsage(
      opts.userId,
      'deepseek_v4_flash',
      qa.inputTokens,
      qa.outputTokens,
    );
  }

  // One fix pass if QA failed and we have fix hints
  if (!qa.ok && qa.fixHints.length && !opts.signal?.aborted) {
    emit({
      agent: 'builder',
      status: 'fixing',
      message: 'QA found issues — applying fix pass…',
      swarmStatusLabel: 'Fixing',
      swarmActivity: qa.issues.slice(0, 2).join('; ') || 'QA fixes',
      swarmTodos: todosForBuild('qa'),
    });
    try {
      const fixPrompt = isUpdate
        ? `${incrementalUpdateContext(nextFiles)}\n\nQA issues to fix with SEARCH/REPLACE:\n${qa.issues.map((i) => `- ${i}`).join('\n')}\nHints:\n${qa.fixHints.map((h) => `- ${h}`).join('\n')}`
        : `Fix these QA issues in the project. Return full updated files with path fences.\nIssues:\n${qa.issues.map((i) => `- ${i}`).join('\n')}\nHints:\n${qa.fixHints.map((h) => `- ${h}`).join('\n')}\n\nCurrent index.html:\n\`\`\`html\n${siteForQa.html.slice(0, 40000)}\n\`\`\``;

      const fixResult = await callBuilderStream(
        route.builder,
        [
          { role: 'system', content: BUILDER_SYSTEM },
          { role: 'user', content: fixPrompt },
        ],
        { maxTokens: 12288, temperature: 0.25, onDelta: opts.onDelta },
      );
      usage = await recordUsage(
        opts.userId,
        fixResult.modelId,
        fixResult.inputTokens,
        fixResult.outputTokens,
      );

      if (isUpdate) {
        const patches = extractSearchReplacePatches(fixResult.text);
        if (patches.length) {
          const applied = applyPatches(nextFiles, patches);
          if (applied.applied.length) nextFiles = applied.files;
        } else {
          const extracted = extractProjectFiles(fixResult.text);
          if (extracted.length) nextFiles = mergeFileMaps(nextFiles, extracted);
        }
      } else {
        const extracted = extractProjectFiles(fixResult.text);
        if (extracted.length) nextFiles = mergeFileMaps(nextFiles, extracted);
        else {
          const site = extractSiteFiles(fixResult.text);
          if (site?.html) {
            nextFiles = mergeFileMaps(
              nextFiles,
              landingFilesFromOutput(site.html, site.css, site.js),
            );
          }
        }
      }

      const reQaSite = filesToSite(nextFiles);
      qa = await reviewBuildOutput({
        prompt: userFacingPrompt,
        html: reQaSite.html,
        css: reQaSite.css,
        js: reQaSite.js,
        isUpdate,
      });
      if (qa.inputTokens || qa.outputTokens) {
        usage = await recordUsage(
          opts.userId,
          'deepseek_v4_flash',
          qa.inputTokens,
          qa.outputTokens,
        );
      }
    } catch (err) {
      console.warn('[pipeline] QA fix pass failed:', (err as Error).message);
    }
  }

  const fileTrail = buildFileTrail(
    isUpdate ? previousFiles : previousFiles.map((f) => ({ ...f, content: '' })),
    nextFiles,
  ).filter((f) => !f.path.endsWith('README.md'));

  const effectiveTrail =
    isUpdate && fileTrail.length === 0
      ? [
          {
            path: 'index.html',
            before: previousFiles.find((f) => f.path === 'index.html')?.content ?? '',
            after: nextFiles.find((f) => f.path === 'index.html')?.content ?? '',
            added: 0,
            removed: 0,
          },
        ]
      : fileTrail;

  const changedFiles = isUpdate
    ? nextFiles.filter((f) => {
        const prev = previousFiles.find((p) => p.path === f.path)?.content ?? '';
        return prev !== f.content;
      })
    : nextFiles;

  const changesSummary = isUpdate
    ? [
        ...(usedPatches ? ['Applied surgical SEARCH/REPLACE patches'] : []),
        ...changesFromTrail(effectiveTrail, userFacingPrompt),
        ...(qa.issues.length ? [`QA notes: ${qa.issues.slice(0, 2).join('; ')}`] : []),
      ]
    : [
        `Built ${projectName}`,
        `${nextFiles.length} project files`,
        ...(qa.issues.length ? [`QA notes: ${qa.issues.slice(0, 2).join('; ')}`] : []),
      ];

  // Server-side GitHub push + Vercel deploy
  let githubRepoUrl: string | undefined;
  let githubRepoName = meta?.githubTargetRepo;
  let githubPushConfirmed = false;
  let commitSha: string | undefined;
  let githubBranch = meta?.githubTargetBranch || 'main';
  let deployUrl = '';
  let deployVerified = false;
  let vercelPreviewUrl: string | undefined;

  const githubOk = await isGitHubConnected(opts.userId);
  const filesToPush = isUpdate ? (changedFiles.length ? changedFiles : []) : nextFiles;

  if (githubOk && filesToPush.length && (meta?.githubTargetRepo || !isUpdate)) {
    emit({
      agent: 'deploy',
      status: 'pushing',
      message: meta?.githubTargetRepo
        ? `Pushing ${filesToPush.length} file(s) to ${meta.githubTargetRepo}…`
        : `Pushing ${filesToPush.length} file(s) to GitHub…`,
      swarmStatusLabel: 'Pushing',
      swarmActivity: meta?.githubTargetRepo || 'GitHub',
      swarmTodos: todosForBuild('push'),
    });
    try {
      const pushed = await pushBuildToGitHub(opts.userId, filesToPush, {
        targetRepo: meta?.githubTargetRepo,
        targetBranch: githubBranch,
        slug: `xroga-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
      });
      githubRepoUrl = pushed.htmlUrl;
      githubRepoName = pushed.repoName;
      githubPushConfirmed = true;
      commitSha = pushed.commitSha;
      githubBranch = pushed.branch || githubBranch;
    } catch (err) {
      console.warn('[pipeline] GitHub push failed:', (err as Error).message);
      emit({
        agent: 'deploy',
        status: 'push_failed',
        message: `GitHub push failed: ${(err as Error).message}`,
        swarmStatusLabel: 'Push failed',
        swarmActivity: (err as Error).message.slice(0, 120),
        swarmTodos: todosForBuild('push'),
      });
    }
  }

  // Vercel redeploy (new builds + updates) when user connected
  const vercelToken = await getVercelToken(opts.userId);
  if (vercelToken && nextFiles.some((f) => f.path.endsWith('.html') || f.path === 'index.html')) {
    emit({
      agent: 'deploy',
      status: 'deploying',
      message: isUpdate ? 'Redeploying preview to Vercel…' : 'Deploying to Vercel…',
      swarmStatusLabel: 'Deploying',
      swarmActivity: 'Vercel',
      swarmTodos: todosForBuild('push'),
    });
    try {
      const slug =
        (githubRepoName?.split('/').pop() || projectName)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) || 'xroga-build';
      const deployed = await deployToAllPlatforms(slug, nextFiles, opts.userId);
      if (deployed.deployVerified && deployed.deployUrl) {
        deployUrl = deployed.deployUrl;
        deployVerified = true;
        vercelPreviewUrl = deployed.vercel?.deployUrl || deployed.deployUrl;
      }
    } catch (err) {
      console.warn('[pipeline] Vercel deploy failed:', (err as Error).message);
    }
  }

  const outSite = filesToSite(nextFiles);

  emit({
    agent: 'builder',
    status: 'complete',
    message: isUpdate
      ? githubPushConfirmed
        ? 'Update pushed'
        : 'Update ready'
      : 'Site ready',
    swarmStatusLabel: 'Done',
    swarmActivity: deployVerified
      ? `Live · ${deployUrl}`
      : githubPushConfirmed
        ? `Pushed to ${githubRepoName}`
        : 'Preview ready',
    swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
  });

  const output: Record<string, unknown> = {
    type: 'landing_page',
    html: outSite.html,
    css: outSite.css,
    js: outSite.js,
    projectFiles: nextFiles.map((f) => ({ path: f.path, content: f.content })),
    generatedFiles: nextFiles.map((f) => f.path),
    fileCount: nextFiles.length,
    projectName,
    message: isUpdate
      ? `Updated **${projectName}** with ${MODELS[result.modelId].label}.`
      : `Built **${projectName}** with ${MODELS[result.modelId].label}.`,
    modelLabel: MODELS[result.modelId].label,
    userPrompt: userFacingPrompt,
    isUpdate,
    usedSurgicalPatches: usedPatches,
    updatedFiles: isUpdate ? effectiveTrail.map((f) => f.path) : undefined,
    changesSummary,
    fileTrail: effectiveTrail,
    previousFiles: isUpdate
      ? previousFiles.map((f) => ({ path: f.path, content: f.content }))
      : undefined,
    githubRepoUrl,
    githubRepoName,
    githubPushConfirmed,
    commitSha,
    githubBranch,
    deployUrl,
    deployVerified,
    vercelPreviewUrl,
    qa: {
      ok: qa.ok,
      issues: qa.issues,
      fixHints: qa.fixHints,
    },
  };

  completeRun(runId, {
    output,
    featureCategory: 'landing_page',
    tokenUsage: usageToTokenUsage(usage),
    success: true,
  });

  return {
    runId,
    success: true,
    featureCategory: 'landing_page',
    output,
    tokenUsage: usageToTokenUsage(usage),
    followUps: isUpdate
      ? ['Undo last update', 'Make another tweak', 'Open preview']
      : ['Refine the design', 'Add another feature', 'Open preview'],
    route,
  };
}
