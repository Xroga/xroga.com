import { randomUUID } from 'crypto';
import { convertUserRequest } from './converter.js';
import { MODELS, type ModelId } from './models.js';
import { chatCompletion, type ChatMessage } from './openaiCompat.js';
import {
  BUILDER_SYSTEM,
  CHAT_SYSTEM,
  incrementalUpdateContext,
  researchSynthesisPrompt,
} from './prompts.js';
import { assertHasQuota, recordUsage, usageToTokenUsage, type UsageSnapshot } from './quota.js';
import { formatResearchForPrompt, gatherResearch, type ResearchBundle } from './research.js';
import { isBuildPrompt, routePrompt, type RouteDecision } from './router.js';
import { extractSiteFiles, siteLooksComplete } from './siteBuilder.js';
import {
  fetchBuildFilesFromGitHub,
  landingFilesFromOutput,
  pushBuildToGitHub,
} from '../services/integrations/githubDeploy.js';

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
    priorSite: prior && typeof prior.html === 'string' && prior.html.trim().length > 40
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

function lineDiffCounts(before: string, after: string): { added: number; removed: number } {
  const a = before.split('\n');
  const b = after.split('\n');
  const aSet = new Map<string, number>();
  for (const line of a) aSet.set(line, (aSet.get(line) ?? 0) + 1);
  let removed = 0;
  let added = 0;
  const bSet = new Map<string, number>();
  for (const line of b) bSet.set(line, (bSet.get(line) ?? 0) + 1);
  for (const [line, count] of aSet) {
    const next = bSet.get(line) ?? 0;
    if (count > next) removed += count - next;
  }
  for (const [line, count] of bSet) {
    const prev = aSet.get(line) ?? 0;
    if (count > prev) added += count - prev;
  }
  return { added, removed };
}

function buildFileTrail(
  previous: Array<{ path: string; content: string }>,
  next: Array<{ path: string; content: string }>,
): Array<{ path: string; before: string; after: string; added: number; removed: number }> {
  const prevMap = new Map(previous.map((f) => [f.path, f.content]));
  const nextMap = new Map(next.map((f) => [f.path, f.content]));
  const paths = new Set([...prevMap.keys(), ...nextMap.keys()]);
  const trail: Array<{
    path: string;
    before: string;
    after: string;
    added: number;
    removed: number;
  }> = [];

  for (const path of paths) {
    if (path.endsWith('README.md') || path === 'vercel.json') continue;
    const before = prevMap.get(path) ?? '';
    const after = nextMap.get(path) ?? '';
    if (before === after) continue;
    const { added, removed } = lineDiffCounts(before, after);
    trail.push({ path, before, after, added, removed });
  }

  return trail;
}

function changesFromTrail(
  trail: Array<{ path: string; added: number; removed: number }>,
  userPrompt: string,
): string[] {
  const bullets = trail.slice(0, 6).map((f) => {
    if (!f.added && !f.removed) return `Touched ${f.path}`;
    return `Updated ${f.path} (+${f.added} / −${f.removed})`;
  });
  if (!bullets.length) {
    return [`Applied update: ${userPrompt.slice(0, 120)}`];
  }
  return bullets;
}

async function hydratePriorSite(
  userId: string,
  meta?: BuildClientMeta,
): Promise<{
  html: string;
  css: string;
  js: string;
  projectName?: string;
  fromGitHub: boolean;
} | null> {
  if (meta?.priorSite?.html?.trim()) {
    return {
      html: meta.priorSite.html,
      css: meta.priorSite.css ?? '',
      js: meta.priorSite.js ?? '',
      projectName: meta.priorSite.projectName,
      fromGitHub: false,
    };
  }

  if (meta?.githubTargetRepo?.includes('/')) {
    try {
      const files = await fetchBuildFilesFromGitHub(
        userId,
        meta.githubTargetRepo,
        meta.githubTargetBranch,
      );
      const html = files.find((f) => f.path === 'index.html')?.content ?? '';
      if (!html.trim()) return null;
      return {
        html,
        css: files.find((f) => f.path === 'styles.css')?.content ?? '',
        js: files.find((f) => f.path === 'script.js')?.content ?? '',
        fromGitHub: true,
      };
    } catch (err) {
      console.warn('[pipeline] fetch prior from GitHub failed:', (err as Error).message);
      return null;
    }
  }

  return null;
}

async function callWithFallback(
  preferred: ModelId,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number },
): Promise<Awaited<ReturnType<typeof chatCompletion>>> {
  const order = [preferred, ...BUILDER_FALLBACKS.filter((m) => m !== preferred)];
  let lastErr: Error | null = null;
  for (const modelId of order) {
    try {
      return await chatCompletion(modelId, messages, opts);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[pipeline] ${modelId} failed:`, lastErr.message);
    }
  }
  throw lastErr ?? new Error('All AI models failed');
}

function todosForBuild(step: 'route' | 'research' | 'convert' | 'build' | 'push' | 'done') {
  const steps = [
    { id: 'route', label: 'Route request' },
    { id: 'research', label: 'Gather research' },
    { id: 'convert', label: 'Convert to builder brief' },
    { id: 'build', label: 'Generate product' },
    { id: 'push', label: 'Push update to GitHub' },
  ] as const;
  const order = ['route', 'research', 'convert', 'build', 'push'] as const;
  const idx = step === 'done' ? order.length : order.indexOf(step);
  return steps.map((s, i) => ({
    id: s.id,
    label: s.label,
    status: (i < idx ? 'done' : i === idx ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));
}

/**
 * Light chat / research Q&A — Phase 1 lane (no site build).
 */
export async function runChatPipeline(opts: {
  userId: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ChatPipelineResult> {
  await assertHasQuota(opts.userId);
  const route = routePrompt(opts.prompt);

  // Build-shaped prompts should use the swarm execute path
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

  const result = await callWithFallback(
    route.builder,
    [{ role: 'system', content: CHAT_SYSTEM }, ...historyMsgs, { role: 'user', content: userContent }],
    { maxTokens: route.kind === 'research' ? 8192 : 4096, temperature: 0.5 },
  );

  let usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);

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
 * Full Converter → Builder product pipeline with SSE progress hooks.
 * Supports incremental updates (clientMeta.buildUpdate) with real diffs + GitHub push.
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

  await assertHasQuota(opts.userId);
  const route = routePrompt(opts.prompt);

  const prior = await hydratePriorSite(opts.userId, meta);
  const isUpdate = Boolean(meta?.buildUpdate && prior?.html?.trim());

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
  if (route.useResearch && !isUpdate) {
    emit({
      agent: 'research',
      status: 'searching',
      message: 'Gathering sources (Tavily / SearXNG)…',
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
      ? 'Converting update request into a patch brief…'
      : 'Converting your request into a builder brief…',
    swarmStatusLabel: 'Briefing',
    swarmActivity: `Converter · ${MODELS[route.converter].label}`,
    swarmTodos: todosForBuild('convert'),
  });

  const converted = await convertUserRequest(
    isUpdate
      ? `INCREMENTAL UPDATE to existing project "${prior?.projectName || 'current site'}". Apply only this change: ${opts.prompt}`
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
      ? `Applying update with ${MODELS[route.builder].label}…`
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
    isUpdate && prior
      ? `\n\n${incrementalUpdateContext({
          userRequest: userFacingPrompt,
          projectName: prior.projectName,
          priorHtml: prior.html,
          priorCss: prior.css,
          priorJs: prior.js,
        })}`
      : '';

  const builderUser = `${converted.instruction}${historyNote}${
    researchBlock ? `\n\n${researchBlock}` : ''
  }${updateBlock}\n\nOriginal user request:\n${opts.prompt}`;

  const result = await callWithFallback(
    route.builder,
    [
      { role: 'system', content: BUILDER_SYSTEM },
      { role: 'user', content: builderUser },
    ],
    { maxTokens: 16384, temperature: isUpdate ? 0.35 : 0.45 },
  );

  usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);

  // Stream text to UI in chunks for perceived progress
  const text = result.text;
  const chunkSize = 120;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (opts.signal?.aborted) break;
    opts.onDelta?.(text.slice(i, i + chunkSize));
  }

  let site = extractSiteFiles(text);

  // On update: if model returns incomplete HTML, keep prior and merge partial CSS/JS
  if (isUpdate && prior) {
    if (!site || !site.html.trim()) {
      site = { html: prior.html, css: prior.css, js: prior.js };
    } else {
      const incomplete = !siteLooksComplete(site) || site.html.length < prior.html.length * 0.35;
      if (incomplete) {
        site = {
          html: prior.html,
          css: site.css?.trim() ? site.css : prior.css,
          js: site.js?.trim() ? site.js : prior.js,
        };
      } else {
        site = {
          html: site.html,
          css: site.css?.trim() ? site.css : prior.css,
          js: site.js?.trim() ? site.js : prior.js,
        };
      }
    }
  }

  const projectName = isUpdate
    ? prior?.projectName || projectNameFromPrompt(opts.prompt)
    : projectNameFromPrompt(opts.prompt);

  if (site && (siteLooksComplete(site) || (isUpdate && site.html.trim().length > 40))) {
    const nextFiles = landingFilesFromOutput(site.html, site.css, site.js);
    const previousFiles = prior
      ? landingFilesFromOutput(prior.html, prior.css, prior.js)
      : [];

    const fileTrail = isUpdate
      ? buildFileTrail(previousFiles, nextFiles)
      : nextFiles
          .filter((f) => !f.path.endsWith('README.md'))
          .map((f) => {
            const { added, removed } = lineDiffCounts('', f.content);
            return { path: f.path, before: '', after: f.content, added, removed };
          });

    // If update produced no textual diff, still surface the request as a no-op trail entry
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
      ? changesFromTrail(effectiveTrail, userFacingPrompt)
      : undefined;

    let githubRepoUrl: string | undefined;
    let githubRepoName: string | undefined;
    let githubPushConfirmed = false;
    let commitSha: string | undefined;
    let githubBranch = meta?.githubTargetBranch || 'main';

    if (isUpdate && meta?.githubTargetRepo?.includes('/') && changedFiles.length > 0) {
      emit({
        agent: 'deploy',
        status: 'pushing',
        message: `Pushing ${changedFiles.length} file(s) to ${meta.githubTargetRepo}…`,
        swarmStatusLabel: 'Pushing',
        swarmActivity: meta.githubTargetRepo,
        swarmTodos: todosForBuild('push'),
      });
      try {
        const pushed = await pushBuildToGitHub(opts.userId, changedFiles, {
          targetRepo: meta.githubTargetRepo,
          targetBranch: githubBranch,
        });
        githubRepoUrl = pushed.htmlUrl;
        githubRepoName = pushed.repoName;
        githubPushConfirmed = true;
        commitSha = pushed.commitSha;
        githubBranch = pushed.branch || githubBranch;
      } catch (err) {
        console.warn('[pipeline] update GitHub push failed:', (err as Error).message);
        githubRepoName = meta.githubTargetRepo;
        emit({
          agent: 'deploy',
          status: 'push_failed',
          message: `Preview updated, but GitHub push failed: ${(err as Error).message}`,
          swarmStatusLabel: 'Push failed',
          swarmActivity: (err as Error).message.slice(0, 120),
          swarmTodos: todosForBuild('push'),
        });
      }
    } else if (isUpdate && meta?.githubTargetRepo?.includes('/')) {
      githubRepoName = meta.githubTargetRepo;
    }

    emit({
      agent: 'builder',
      status: 'complete',
      message: isUpdate
        ? githubPushConfirmed
          ? 'Update pushed to GitHub'
          : 'Update ready'
        : 'Site ready',
      swarmStatusLabel: 'Done',
      swarmActivity: isUpdate
        ? githubPushConfirmed
          ? `Pushed to ${githubRepoName}`
          : 'Preview updated'
        : 'Preview ready',
      swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
    });

    return {
      runId,
      success: true,
      featureCategory: 'landing_page',
      output: {
        type: 'landing_page',
        html: site.html,
        css: site.css,
        js: site.js,
        projectName,
        message: isUpdate
          ? `Updated **${projectName}** with ${MODELS[result.modelId].label}.`
          : `Built **${projectName}** with ${MODELS[result.modelId].label}.`,
        modelLabel: MODELS[result.modelId].label,
        userPrompt: userFacingPrompt,
        isUpdate,
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
      },
      tokenUsage: usageToTokenUsage(usage),
      followUps: isUpdate
        ? ['Undo last update', 'Deploy to Vercel', 'Make another tweak', 'Open the project card']
        : ['Push this to GitHub', 'Deploy to Vercel', 'Refine the design', 'Add another feature'],
      route,
    };
  }

  // Chat / research / analysis style output
  emit({
    agent: 'builder',
    status: 'complete',
    message: 'Response ready',
    swarmStatusLabel: 'Done',
    swarmActivity: 'Answer ready',
    swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
  });

  return {
    runId,
    success: true,
    featureCategory: route.kind === 'research' ? 'deep_research' : 'chat',
    output: {
      type: 'chat',
      content: text,
      modelLabel: MODELS[result.modelId].label,
      webSources: research?.sources,
    },
    tokenUsage: usageToTokenUsage(usage),
    followUps: isBuildPrompt(opts.prompt)
      ? ['Try again with more detail', 'Ask for HTML/CSS/JS output']
      : ['Ask a follow-up', 'Start a full build'],
    route,
  };
}
