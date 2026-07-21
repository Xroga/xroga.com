import { randomUUID } from 'crypto';
import { convertUserRequest } from './converter.js';
import { MODELS, type ModelId } from './models.js';
import {
  buildVisionUserContent,
  chatCompletionStream,
  type ChatMessage,
} from './openaiCompat.js';
import {
  BUILDER_SYSTEM,
  CHAT_SYSTEM,
  DOC_SYSTEM,
  VISION_SYSTEM,
  incrementalUpdateContext,
  researchSynthesisPrompt,
} from './prompts.js';
import {
  defaultAttachmentPrompt,
  pickAttachmentModel,
  prepareAttachments,
  type ChatAttachment,
} from './attachments.js';
import {
  assertCanUseModel,
  assertHasQuota,
  recordUsage,
  usageToTokenUsage,
  type UsageSnapshot,
} from './quota.js';
import { formatResearchForPrompt, gatherResearch, type ResearchBundle } from './research.js';
import { isBuildPrompt, routePrompt, type RouteDecision } from './router.js';
import {
  extractProjectFiles,
  extractSiteFiles,
  siteLooksComplete,
} from './siteBuilder.js';
import {
  applyDeletes,
  applyPatches,
  buildFileTrail,
  extractDeletePaths,
  extractSearchReplacePatches,
  type ProjectFile,
} from './patches.js';
import { reviewBuildOutput } from './qa.js';
import { completeRun, createRun } from './runStore.js';
import {
  UPDATE_HYDRATE_PATHS,
  fetchBuildFilesFromGitHub,
  fetchGitHubFilesByPaths,
  landingFilesFromOutput,
  pushBuildToGitHub,
  deployToAllPlatforms,
  isGitHubConnected,
  getGithubDefaultRepo,
} from '../services/integrations/githubDeploy.js';
import { getVercelToken } from '../services/integrations/vercelAuth.js';
import {
  getUserSupabaseStatus,
  buildProviderEnvFiles,
  getUserProviderKey,
} from '../services/integrations/userProviderKeys.js';
import {
  buildScaffoldForPrompt,
  detectScaffoldKind,
  mergeScaffoldWithGenerated,
} from '../services/projectScaffold.js';
import {
  detectScaffoldFeatures,
  isNonWebFrameworkScaffold,
  type ScaffoldKind,
} from '../services/scaffolds/detectScaffold.js';
import {
  shipChromeExtensionZip,
  shipElectronPortableZip,
  triggerElectronDesktopRelease,
  waitForDesktopReleaseZip,
} from '../services/publish/nonWebShip.js';
import {
  ensureExpoProjectLinked,
  patchExpoProjectIdInFiles,
  triggerEasPublish,
} from '../services/publish/easPublish.js';
import { publishChromeExtensionToStore } from '../services/publish/chromeWebStore.js';
import { syncElectronSigningSecretsToGitHub } from '../services/publish/electronSecrets.js';
import {
  syncGooglePlayCredentialsToExpo,
  syncAppleAscApiKeyToExpo,
  waitForEasBuildArtifact,
  listEasBuilds,
  packageIdFromProjectName,
} from '../services/publish/easCredentials.js';
import { chromeExtensionZipFilter, packageBuildZip } from '../services/scaffolds/packageBuildZip.js';
import { ensureScaffoldIntegrity } from '../services/scaffolds/scaffoldIntegrity.js';
import { guessDeletePaths, selectFilesForUpdate } from './fileSelector.js';
import {
  getProjectMemory,
  getProjectMemoryAsync,
  patchProjectMemory,
  setProjectMemory,
  shouldGenerateAiSummary,
} from './projectMemory.js';
import { summarizeRepoForUpdates } from './repoSummarize.js';
import { scanProjectFiles, redactCriticalSecrets } from './securityScan.js';
import { staticValidateProject } from './staticValidate.js';
import { compileValidateProject } from './compileValidate.js';
import { formatArchitectForBuilder, runArchitectPlan } from './architect.js';
import {
  loadSessionHistory,
  mergeHistories,
  saveSessionHistory,
} from './sessionMemory.js';
import { RunTrace } from './runTrace.js';
import { verifyShippedProduct } from '../lib/shipVerify.js';
import type { VercelEnvSyncResult } from '../lib/vercelEnv.js';
import { computeShipOutcome } from './shipOutcome.js';

export interface PipelineProgress {
  agent?: string;
  status?: string;
  message?: string;
  swarmStatusLabel?: string;
  swarmActivity?: string;
  swarmTodos?: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>;
  keepalive?: boolean;
  /** Drives Workspace role chips — must advance with real agents. */
  negotiationPhase?: number;
  userFacingPhase?: number;
  /** Open GitHub connect gate early (before long build finishes). */
  needsGitHub?: boolean;
  /** Open Vercel connect gate early. */
  needsVercel?: boolean;
  /** Update mode needs sticky/selected repo. */
  needsRepoPick?: boolean;
}

/** Map pipeline agents → Workspace collaboration chip phases (0–8). */
function negotiationPhaseForAgent(agent?: string): number | undefined {
  if (!agent) return undefined;
  switch (agent) {
    case 'router':
      return 0;
    case 'research':
    case 'analyst':
      return 1;
    case 'converter':
    case 'vision':
      return 2;
    case 'architect':
      return 3;
    case 'builder':
      return 4;
    case 'reviewer':
      return 5;
    case 'qa':
    case 'compiler':
      return 6;
    case 'security':
      return 7;
    case 'deploy':
      return 8;
    default:
      return undefined;
  }
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
): Promise<{
  files: ProjectFile[];
  projectName?: string;
  fromMemory: boolean;
  aiSummary?: string;
}> {
  const branch = meta?.githubTargetBranch || 'main';
  const repo = meta?.githubTargetRepo ?? null;

  // 1) Hot + DB memory — no GitHub re-read when snapshot exists
  const mem = await getProjectMemoryAsync(userId, repo, branch);
  if (mem?.files?.length) {
    return {
      files: mem.files,
      projectName: mem.projectName || meta?.priorSite?.projectName,
      fromMemory: true,
      aiSummary: mem.aiSummary,
    };
  }

  // 2) Client priorSite (workspace preview) — cheap, no GitHub
  if (meta?.priorSite?.html?.trim()) {
    const files = landingFilesFromOutput(
      meta.priorSite.html,
      meta.priorSite.css ?? '',
      meta.priorSite.js ?? '',
    );
    setProjectMemory({
      userId,
      repo,
      branch,
      projectName: meta.priorSite.projectName,
      files,
    });
    return {
      files,
      projectName: meta.priorSite.projectName,
      fromMemory: false,
      aiSummary: undefined,
    };
  }

  // 3) GitHub — hydrate classic + Next/Expo paths so patches match the live repo
  if (repo?.includes('/')) {
    try {
      const files = await fetchGitHubFilesByPaths(userId, repo, UPDATE_HYDRATE_PATHS, branch);
      if (!files.length) {
        const full = await fetchBuildFilesFromGitHub(userId, repo, branch);
        if (!full.length) return { files: [], fromMemory: false };
        setProjectMemory({ userId, repo, branch, files: full });
        return { files: full, fromMemory: false };
      }
      setProjectMemory({ userId, repo, branch, files });
      return { files, fromMemory: false };
    } catch (err) {
      console.warn('[pipeline] fetch prior from GitHub failed:', (err as Error).message);
    }
  }
  return { files: [], fromMemory: false };
}

async function callBuilderStream(
  preferred: ModelId,
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    onDelta?: DeltaFn;
    userId?: string;
    signal?: AbortSignal;
    onModelFallback?: (from: ModelId, to: ModelId) => void;
  },
): Promise<Awaited<ReturnType<typeof chatCompletionStream>>> {
  const order = [preferred, ...BUILDER_FALLBACKS.filter((m) => m !== preferred)];
  let lastErr: Error | null = null;
  for (const modelId of order) {
    try {
      if (opts.signal?.aborted) {
        const err = new Error('Build cancelled') as Error & { code?: string };
        err.code = 'BUILD_CANCELLED';
        throw err;
      }
      if (opts.userId) {
        await assertCanUseModel(opts.userId, modelId);
      }
      if (modelId !== preferred) {
        console.warn(`[pipeline] Falling back from ${preferred} → ${modelId}`);
        opts.onModelFallback?.(preferred, modelId);
      }
      return await chatCompletionStream(modelId, messages, {
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        onDelta: opts.onDelta,
        signal: opts.signal,
      });
    } catch (err) {
      lastErr = err as Error;
      const code = (lastErr as Error & { code?: string }).code;
      if (code === 'OUT_OF_TOKENS' || code === 'BUILD_CANCELLED') throw lastErr;
      console.warn(`[pipeline] ${modelId} stream failed:`, lastErr.message);
    }
  }
  throw lastErr ?? new Error('All AI models failed');
}

type ResearchTodoState = 'omit' | 'pending' | 'active' | 'done' | 'skipped';

type BuildTodoStatus = 'done' | 'active' | 'pending' | 'skipped';

/**
 * Build pipeline todos. Research is never auto-checked when it was skipped or never run.
 * researchState:
 *   omit    — not requested (step removed from list)
 *   skipped — ran, no live sources (honest skipped status, not a green check)
 *   done    — real sources returned
 */
function todosForBuild(
  step:
    | 'route'
    | 'research'
    | 'convert'
    | 'architect'
    | 'build'
    | 'qa'
    | 'compile'
    | 'push'
    | 'done',
  researchState: ResearchTodoState = 'omit',
) {
  const all = [
    { id: 'route', label: 'Route request' },
    { id: 'research', label: 'Gather research' },
    { id: 'convert', label: 'Convert to builder brief' },
    { id: 'architect', label: 'Architect file plan' },
    { id: 'build', label: 'Generate product' },
    { id: 'qa', label: 'Review quality' },
    { id: 'compile', label: 'Compile validate' },
    { id: 'push', label: 'Push & deploy' },
  ] as const;

  const steps =
    researchState === 'omit' ? all.filter((s) => s.id !== 'research') : [...all];

  const order = steps.map((s) => s.id);
  const idx = step === 'done' ? order.length : Math.max(0, order.indexOf(step));

  return steps.map((s, i) => {
    if (s.id === 'research') {
      if (researchState === 'skipped') {
        return {
          id: s.id,
          label: 'Research skipped — no live sources',
          status: 'skipped' as BuildTodoStatus,
        };
      }
      if (researchState === 'active') {
        return { id: s.id, label: s.label, status: 'active' as BuildTodoStatus };
      }
      if (researchState === 'done') {
        return { id: s.id, label: s.label, status: 'done' as BuildTodoStatus };
      }
      return { id: s.id, label: s.label, status: 'pending' as BuildTodoStatus };
    }

    const status: BuildTodoStatus =
      i < idx ? 'done' : i === idx ? 'active' : 'pending';
    return { id: s.id, label: s.label, status };
  });
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
 * Also handles image vision (Grok) and document analysis.
 */
export async function runChatPipeline(opts: {
  userId: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: ChatAttachment[];
  onDelta?: DeltaFn;
}): Promise<ChatPipelineResult> {
  await assertHasQuota(opts.userId);

  const prepared = await prepareAttachments(opts.attachments);
  const hasAttachments = prepared.hasImages || prepared.hasDocuments;

  // Attachment analyze path — never force a website build
  if (hasAttachments) {
    const prompt = defaultAttachmentPrompt(prepared, opts.prompt);
    const pick = pickAttachmentModel(prompt, prepared);
    const system = prepared.hasImages ? VISION_SYSTEM : DOC_SYSTEM;

    let userText = prompt;
    if (prepared.documentBlock) {
      userText += `\n\nAttached document text:\n${prepared.documentBlock}`;
    }

    const userMessage: ChatMessage = prepared.hasImages
      ? {
          role: 'user',
          content: buildVisionUserContent(
            userText,
            prepared.images.map((i) => i.url),
            'high',
          ),
        }
      : { role: 'user', content: userText };

    const historyMsgs: ChatMessage[] = (opts.history ?? [])
      .slice(-8)
      .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }));

    const result = await callBuilderStream(
      pick.modelId,
      [{ role: 'system', content: system }, ...historyMsgs, userMessage],
      {
        userId: opts.userId,
        maxTokens: 6144,
        temperature: 0.35,
        onDelta: opts.onDelta,
      },
    );

    const usage = await recordUsage(
      opts.userId,
      result.modelId,
      result.inputTokens,
      result.outputTokens,
    );

    return {
      response: result.text,
      intent: pick.kind === 'document' ? 'file_analysis' : 'vision_analysis',
      usage: usageToTokenUsage(usage),
      modelId: result.modelId,
      route: {
        kind: pick.kind === 'document' ? 'file_analysis' : 'realtime',
        converter: 'deepseek_v4_flash',
        builder: pick.modelId,
        useResearch: false,
        reason: pick.reason,
      },
    };
  }

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
    if (!researchBlock) research = null;
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
      userId: opts.userId,
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
  attachments?: ChatAttachment[];
  onProgress?: ProgressFn;
  onDelta?: DeltaFn;
  signal?: AbortSignal;
}): Promise<BuildPipelineResult> {
  const runId = randomUUID();
  const trace = new RunTrace(runId, opts.userId);
  const emit = (ev: PipelineProgress) => {
    const phase = ev.negotiationPhase ?? negotiationPhaseForAgent(ev.agent);
    const enriched: PipelineProgress = {
      ...ev,
      ...(phase != null
        ? { negotiationPhase: phase, userFacingPhase: ev.userFacingPhase ?? phase }
        : {}),
    };
    if (enriched.agent && enriched.status) {
      trace.add(enriched.agent, enriched.status, enriched.message);
    }
    opts.onProgress?.(enriched);
  };
  const throwIfAborted = () => {
    if (opts.signal?.aborted) {
      const err = new Error('Build cancelled') as Error & { code?: string };
      err.code = 'BUILD_CANCELLED';
      throw err;
    }
  };
  const metaRaw = parseClientMeta(opts.clientMeta);
  // Sticky default_repo ONLY for explicit updates when the chatbar omitted a target.
  // Greenfield builds must never silently overwrite the last product.
  const stickyDefault =
    metaRaw?.buildUpdate && !metaRaw?.githubTargetRepo?.includes('/')
      ? await getGithubDefaultRepo(opts.userId).catch(() => null)
      : null;
  const meta: BuildClientMeta | undefined = metaRaw
    ? {
        ...metaRaw,
        githubTargetRepo:
          metaRaw.githubTargetRepo ||
          (stickyDefault?.includes('/') ? stickyDefault : undefined),
      }
    : undefined;
  const userFacingPrompt = (meta?.userPrompt || opts.prompt).trim();

  createRun(opts.userId, userFacingPrompt, runId);
  await assertHasQuota(opts.userId);
  throwIfAborted();

  // Durable chat memory across sessions (DB + client history)
  const dbHistory = await loadSessionHistory(opts.userId, meta?.githubTargetRepo, 12);
  const history = mergeHistories(dbHistory, opts.history ?? []);

  // Attachments without a build intent → vision/doc analyze (not a site rebuild)
  const preparedEarly = await prepareAttachments(opts.attachments);
  const attachmentOnlyAnalyze =
    (preparedEarly.hasImages || preparedEarly.hasDocuments) &&
    !isBuildPrompt(opts.prompt) &&
    !meta?.buildUpdate;

  if (attachmentOnlyAnalyze) {
    emit({
      agent: 'vision',
      status: 'analyzing',
      message: preparedEarly.hasImages
        ? 'Analyzing image(s) with Grok vision…'
        : 'Analyzing document(s)…',
      swarmStatusLabel: 'Analyze',
      swarmActivity: preparedEarly.hasImages ? 'Grok vision' : 'Doc extract',
      swarmTodos: todosForBuild('route', 'omit'),
    });
    const chat = await runChatPipeline({
      userId: opts.userId,
      prompt: opts.prompt,
      history: opts.history,
      attachments: opts.attachments,
      onDelta: opts.onDelta,
    });
    const output = {
      type: 'chat',
      content: chat.response,
      modelLabel: MODELS[chat.modelId].label,
      analyzeKind: chat.intent,
    };
    completeRun(runId, {
      output,
      featureCategory: chat.intent === 'file_analysis' ? 'deep_research' : 'chat',
      tokenUsage: chat.usage,
      success: true,
    });
    emit({
      agent: 'vision',
      status: 'complete',
      message: 'Analysis ready',
      swarmStatusLabel: 'Done',
      swarmActivity: MODELS[chat.modelId].label,
      swarmTodos: todosForBuild('done', 'omit').map((t) => ({ ...t, status: 'done' as const })),
    });
    return {
      runId,
      success: true,
      featureCategory: chat.intent === 'file_analysis' ? 'deep_research' : 'chat',
      output,
      tokenUsage: chat.usage,
      followUps: ['Ask a follow-up', 'Apply this to my project', 'Upload another file'],
      route: chat.route,
    };
  }

  const route = routePrompt(opts.prompt);

  const prior = await hydratePriorFiles(opts.userId, meta);
  const isUpdate = Boolean(meta?.buildUpdate && prior.files.length);
  let cachedSummary = prior.aiSummary;
  let usage: UsageSnapshot | null = null;
  /** Tracks whether research ran / skipped so todos never green-check empty research. */
  let researchState: ResearchTodoState = 'omit';
  const todos = (
    step: Parameters<typeof todosForBuild>[0],
  ) => todosForBuild(step, researchState);
  const emitModelSwitch = (from: ModelId, to: ModelId) => {
    emit({
      agent: 'builder',
      status: 'model_fallback',
      message: `Switched ${MODELS[from].label} → ${MODELS[to].label} (capacity or availability)`,
      swarmStatusLabel: MODELS[to].label,
      swarmActivity: 'Fallback',
      swarmTodos: todos('build'),
    });
  };

  emit({
    agent: 'router',
    status: 'routing',
    message: isUpdate
      ? `Update mode · ${prior.fromMemory ? 'memory hit (no re-read)' : 'hydrated'} · ${route.reason}`
      : route.reason,
    swarmStatusLabel: isUpdate ? 'Updating' : 'Routing',
    swarmActivity: isUpdate
      ? `Patching ${prior.projectName || meta?.githubTargetRepo || 'project'}`
      : `Assigning ${MODELS[route.builder].label}`,
    swarmTodos: todos('route'),
  });

  // Early OAuth preflight — warn before long build so users connect before waiting
  const githubOkEarly = await isGitHubConnected(opts.userId);
  const vercelOkEarly = Boolean(await getVercelToken(opts.userId));
  const scaffoldKindEarly = detectScaffoldKind(userFacingPrompt);
  const needsVercelEarly = !isNonWebFrameworkScaffold(scaffoldKindEarly);
  const earlyShipBlockers: string[] = [];
  if (!githubOkEarly) earlyShipBlockers.push('Connect GitHub to push code to your repo');
  if (needsVercelEarly && !vercelOkEarly) {
    earlyShipBlockers.push('Connect Vercel to deploy live to your account');
  }
  if (isUpdate && githubOkEarly && !meta?.githubTargetRepo) {
    earlyShipBlockers.push(
      'Update mode needs your ship repo — we remember it after first ship, or pick it once in Terminal.',
    );
  }
  if (earlyShipBlockers.length) {
    emit({
      agent: 'deploy',
      status: 'ship_preflight',
      message: `Connect integrations now so this build can ship live: ${earlyShipBlockers[0]}`,
      swarmStatusLabel: 'Authorize',
      swarmActivity: earlyShipBlockers.join(' · '),
      swarmTodos: todos('route'),
      needsGitHub: !githubOkEarly,
      needsVercel: needsVercelEarly && !vercelOkEarly,
      needsRepoPick: Boolean(isUpdate && githubOkEarly && !meta?.githubTargetRepo),
    });
  } else {
    emit({
      agent: 'deploy',
      status: 'ship_preflight_ok',
      message: meta?.githubTargetRepo
        ? `Ship ready · target ${meta.githubTargetRepo}`
        : needsVercelEarly
          ? 'Ship ready · GitHub + Vercel connected'
          : 'Ship ready · GitHub connected (desktop/extension/mobile)',
      swarmStatusLabel: 'Ship ready',
      swarmActivity: meta?.githubTargetRepo || 'Authorize OK',
      swarmTodos: todos('route'),
    });
  }

  // Optional one-time AI memo (GLM / DeepSeek Pro) — skipped when memory already has it
  if (
    isUpdate &&
    shouldGenerateAiSummary(
      userFacingPrompt,
      getProjectMemory(opts.userId, meta?.githubTargetRepo, meta?.githubTargetBranch),
      prior.files.length,
    )
  ) {
    emit({
      agent: 'analyst',
      status: 'summarizing',
      message: 'One-time project memo for cheaper future updates…',
      swarmStatusLabel: 'Memo',
      swarmActivity: 'DeepSeek Pro / GLM (once)',
      swarmTodos: todos('route'),
    });
    await assertCanUseModel(
      opts.userId,
      prior.files.length >= 20 || route.kind === 'build_long_horizon' ? 'glm_5_2' : 'deepseek_v4_pro',
    );
    const memo = await summarizeRepoForUpdates({
      prompt: userFacingPrompt,
      projectName: prior.projectName,
      paths: prior.files.map((f) => f.path),
      sampleFiles: prior.files.slice(0, 6),
      preferLongContext: prior.files.length >= 20 || route.kind === 'build_long_horizon',
    });
    if (memo) {
      cachedSummary = memo.summary;
      usage = await recordUsage(opts.userId, memo.modelId, memo.inputTokens, memo.outputTokens);
      setProjectMemory({
        userId: opts.userId,
        repo: meta?.githubTargetRepo,
        branch: meta?.githubTargetBranch,
        projectName: prior.projectName,
        files: prior.files,
        aiSummary: memo.summary,
        aiSummaryModel: memo.modelId,
      });
    }
  }

  let researchBlock = '';
  let research: ResearchBundle | null = null;
  const needResearch = route.useResearch || wantsResearch(opts.prompt, isUpdate);
  if (needResearch) {
    researchState = 'active';
    emit({
      agent: 'research',
      status: 'searching',
      message: 'Live research (web + X via Xroga Live)…',
      swarmStatusLabel: 'Research',
      swarmActivity: 'Xroga Live · web + X',
      swarmTodos: todos('research'),
    });
    research = await gatherResearch(opts.prompt);
    researchBlock = formatResearchForPrompt(research);
    if (!researchBlock) {
      // Do not fake a research step when nothing came back
      research = null;
      researchState = 'skipped';
      emit({
        agent: 'research',
        status: 'skipped',
        message: 'No live sources available — continuing without research',
        swarmStatusLabel: 'Research skipped',
        swarmActivity: 'Build continues',
        swarmTodos: todos('convert'),
      });
    } else {
      researchState = 'done';
      emit({
        agent: 'research',
        status: 'ready',
        message:
          research.provider === 'grok_live'
            ? `Live research ready${research.includedXSearch ? ' (web + X)' : ''} · ${research.sources.length} source(s)`
            : `Research ready · ${research.sources.length} source(s)`,
        swarmStatusLabel: 'Research',
        swarmActivity: research.provider,
        swarmTodos: todos('convert'),
      });
    }
  }

  // Build/update with screenshot: Grok vision → text brief for the (non-vision) builder
  let designReference = '';
  if (preparedEarly.hasImages) {
    emit({
      agent: 'vision',
      status: 'analyzing',
      message: 'Reading attached image(s) with Grok for design/error context…',
      swarmStatusLabel: 'Vision',
      swarmActivity: 'Grok 4.3',
      swarmTodos: todos('convert'),
    });
    try {
      const vision = await callBuilderStream(
        'grok_4_3',
        [
          { role: 'system', content: VISION_SYSTEM },
          {
            role: 'user',
            content: buildVisionUserContent(
              `User will build/update a product from this image. Extract UI structure, colors, typography, copy, and any errors visible.\n\nUser request:\n${userFacingPrompt}`,
              preparedEarly.images.map((i) => i.url),
              'high',
            ),
          },
        ],
        { userId: opts.userId, maxTokens: 2048, temperature: 0.3, signal: opts.signal, onModelFallback: emitModelSwitch },
      );
      usage = await recordUsage(
        opts.userId,
        vision.modelId,
        vision.inputTokens,
        vision.outputTokens,
      );
      designReference = `\n\nDESIGN / SCREENSHOT REFERENCE (from Grok vision):\n${vision.text.slice(0, 6000)}`;
      emit({
        agent: 'vision',
        status: 'model_active',
        message: `Vision with ${MODELS[vision.modelId].label}`,
        swarmStatusLabel: MODELS[vision.modelId].label,
        swarmActivity: 'Vision brief',
        swarmTodos: todos('convert'),
      });
    } catch (err) {
      console.warn('[pipeline] vision brief failed:', (err as Error).message);
    }
  }
  if (preparedEarly.documentBlock) {
    designReference += `\n\nATTACHED DOCUMENT TEXT:\n${preparedEarly.documentBlock.slice(0, 12000)}`;
  }

  // Cost-effective: only send targeted file contents to the builder
  const selection = isUpdate
    ? selectFilesForUpdate(prior.files, userFacingPrompt)
    : { selected: prior.files, skippedPaths: [] as string[], reason: '' };
  const likelyDeletes = isUpdate
    ? guessDeletePaths(
        userFacingPrompt,
        prior.files.map((f) => f.path),
      )
    : [];

  emit({
    agent: 'converter',
    status: 'converting',
    message: isUpdate
      ? `Converting update into a patch brief… (${selection.reason || 'targeted files'})`
      : 'Converting your request into a builder brief…',
    swarmStatusLabel: 'Briefing',
    swarmActivity: `Converter · ${MODELS[route.converter].label}`,
    swarmTodos: todos('convert'),
  });

  await assertCanUseModel(opts.userId, 'deepseek_v4_flash');
  const converted = await convertUserRequest(
    isUpdate
      ? `INCREMENTAL UPDATE to existing project "${prior.projectName || 'current site'}". Apply only this change using SEARCH/REPLACE patches (or Delete File). Do not re-analyze the whole repo: ${opts.prompt}`
      : opts.prompt,
    researchBlock || undefined,
  );
  usage = await recordUsage(
    opts.userId,
    'deepseek_v4_flash',
    converted.inputTokens,
    converted.outputTokens,
  );

  // Architect agent — concrete file plan (real multi-agent stage).
  // Simple static landings use a deterministic plan (no extra OpenRouter wait).
  throwIfAborted();
  const scaffoldForArchitect = detectScaffoldKind(userFacingPrompt);
  const simpleStaticFastPath =
    !isUpdate &&
    scaffoldForArchitect === 'static' &&
    (route.kind === 'build_volume' ||
      /\b(landing\s*page|simple\s+(web|site|app)|static\s+site)\b/i.test(userFacingPrompt));

  emit({
    agent: 'architect',
    status: 'planning',
    message: simpleStaticFastPath
      ? 'Architect using static landing plan (fast path)…'
      : 'Architect planning file tree…',
    swarmStatusLabel: 'Architect',
    swarmActivity: simpleStaticFastPath ? 'Static fast path' : 'File plan',
    swarmTodos: todos('architect'),
  });
  let architectBlock = '';
  let architectPlanSummary: { stack: string; files: string[]; notes: string[] } | undefined;
  try {
    if (simpleStaticFastPath) {
      const plan = {
        stack: 'static',
        files: [
          { path: 'index.html', purpose: 'Landing page markup' },
          { path: 'styles.css', purpose: 'Styles and theme' },
          { path: 'script.js', purpose: 'Interactions' },
          { path: 'vercel.json', purpose: 'Static Vercel deploy' },
          { path: 'README.md', purpose: 'Project readme' },
        ],
        notes: ['Fast path — skipped LLM architect for simple static landing'],
        inputTokens: 0,
        outputTokens: 0,
        raw: '',
      };
      architectBlock = formatArchitectForBuilder(plan);
      architectPlanSummary = {
        stack: plan.stack,
        files: plan.files.map((f) => f.path),
        notes: plan.notes,
      };
      emit({
        agent: 'architect',
        status: 'planned',
        message: `Plan: ${plan.stack} · ${plan.files.length} files (fast path)`,
        swarmStatusLabel: 'Architect',
        swarmActivity: plan.stack,
        swarmTodos: todos('architect'),
      });
    } else {
      await assertCanUseModel(opts.userId, 'deepseek_v4_flash');
      // Cap Architect wait so a hung OpenRouter call cannot freeze the UI for 5+ minutes
      const ARCHITECT_MS = 45_000;
      const plan = await Promise.race([
        runArchitectPlan({
          brief: converted.instruction,
          userPrompt: userFacingPrompt,
          isUpdate,
        }),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => {
            reject(new Error(`Architect timed out after ${ARCHITECT_MS / 1000}s`));
          }, ARCHITECT_MS);
          opts.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              reject(Object.assign(new Error('Build cancelled'), { code: 'BUILD_CANCELLED' }));
            },
            { once: true },
          );
        }),
      ]);
      usage = await recordUsage(
        opts.userId,
        'deepseek_v4_flash',
        plan.inputTokens,
        plan.outputTokens,
      );
      architectBlock = formatArchitectForBuilder(plan);
      architectPlanSummary = {
        stack: plan.stack,
        files: plan.files.map((f) => f.path),
        notes: plan.notes,
      };
      emit({
        agent: 'architect',
        status: 'planned',
        message: `Plan: ${plan.stack} · ${plan.files.length} files`,
        swarmStatusLabel: 'Architect',
        swarmActivity: plan.stack,
        swarmTodos: todos('architect'),
      });
    }
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'BUILD_CANCELLED') throw err;
    console.warn('[pipeline] architect failed (continuing):', (err as Error).message);
    emit({
      agent: 'architect',
      status: 'skipped',
      message: 'Architect skipped — continuing to builder',
      swarmStatusLabel: 'Architect',
      swarmActivity: 'Skipped',
      swarmTodos: todos('build'),
    });
  }

  emit({
    agent: 'builder',
    status: 'building',
    message: isUpdate
      ? `Surgical update · ${selection.selected.length} files in context${prior.fromMemory ? ' · memory' : ''}`
      : `Building with ${MODELS[route.builder].label}…`,
    swarmStatusLabel: isUpdate ? 'Patching' : 'Building',
    swarmActivity: MODELS[route.builder].tagline,
    swarmTodos: todos('build'),
  });

  const historyNote =
    history.length
      ? `\n\nRecent conversation context:\n${history
          .slice(-6)
          .map((h) => `${h.role}: ${h.content.slice(0, 500)}`)
          .join('\n')}`
      : '';

  const updateBlock =
    isUpdate
      ? `\n\n${incrementalUpdateContext(selection.selected, {
          allPaths: prior.files.map((f) => f.path),
          cachedSummary,
          selectionNote: selection.reason,
          likelyDeletes,
        })}`
      : '';

  const builderUser = `${converted.instruction}${architectBlock}${historyNote}${
    researchBlock ? `\n\n${researchBlock}` : ''
  }${designReference}${updateBlock}\n\nOriginal user request:\n${opts.prompt}`;

  let result = await callBuilderStream(
    route.builder,
    [
      { role: 'system', content: BUILDER_SYSTEM },
      { role: 'user', content: builderUser },
    ],
    {
      userId: opts.userId,
      maxTokens: 16384,
      temperature: isUpdate ? 0.3 : 0.45,
      onDelta: opts.onDelta,
      signal: opts.signal,
      onModelFallback: (from, to) => {
        emitModelSwitch(from, to);
      },
    },
  );

  emit({
    agent: 'builder',
    status: 'model_active',
    message: `Building with ${MODELS[result.modelId].label}`,
    swarmStatusLabel: MODELS[result.modelId].label,
    swarmActivity: result.modelId === route.builder ? 'Preferred model' : 'Fallback model',
    swarmTodos: todos('build'),
  });

  usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);

  // Resolve output files: patches first, then full files, then classic site
  let nextFiles: ProjectFile[] = [];
  let previousFiles: ProjectFile[] = prior.files;
  let usedPatches = false;
  let deletedPaths: string[] = [];

  let patchFailures: string[] = [];
  let patchAborted = false;
  if (isUpdate && prior.files.length) {
    throwIfAborted();
    const patches = extractSearchReplacePatches(result.text);
    if (patches.length) {
      const applied = applyPatches(prior.files, patches);
      if (applied.failed.length) {
        // Do NOT half-apply — abort update to protect the live site
        patchFailures = applied.failureReasons;
        patchAborted = true;
        nextFiles = prior.files;
        usedPatches = false;
        emit({
          agent: 'reviewer',
          status: 'patch_aborted',
          message: `Aborted unsafe update — ${applied.failed.length} patch(es) missed SEARCH. Site unchanged.`,
          swarmStatusLabel: 'Aborted',
          swarmActivity: applied.failureReasons.slice(0, 2).join('; ') || 'SEARCH miss',
          swarmTodos: todos('build'),
        });
        trace.setMeta({ patchAborted: true, patchFailures });
      } else if (applied.applied.length) {
        nextFiles = applied.files;
        usedPatches = true;
      }
    }
    if (!patchAborted) {
      const modelDeletes = extractDeletePaths(result.text);
      if (modelDeletes.length) {
        const base = nextFiles.length ? nextFiles : prior.files;
        const removed = applyDeletes(base, modelDeletes);
        nextFiles = removed.files;
        deletedPaths = removed.deleted.filter((p) => prior.files.some((f) => f.path === p));
      }
    }
  }

  if (!nextFiles.length) {
    const extracted = extractProjectFiles(result.text);
    if (extracted.length) {
      nextFiles = isUpdate && prior.files.length ? mergeFileMaps(prior.files, extracted) : extracted;
    }
  }

  if (!nextFiles.length) {
    const site = extractSiteFiles(result.text);
    if (site) {
      nextFiles = landingFilesFromOutput(site.html, site.css, site.js);
      if (isUpdate && prior.files.length) nextFiles = mergeFileMaps(prior.files, nextFiles);
    }
  }

  // Recovery: incomplete update → keep prior and retry once with stricter patch prompt
  // Never recover after an explicit patch abort (protect sticky live repo).
  if (isUpdate && prior.files.length && !patchAborted) {
    const site = filesToSite(nextFiles);
    const bad =
      (!nextFiles.length && !deletedPaths.length) ||
      (site.html.trim().length > 0 &&
        site.html.length < (filesToSite(prior.files).html.length * 0.35) &&
        !usedPatches &&
        !deletedPaths.length);

    if (bad || (!nextFiles.length && !deletedPaths.length)) {
      emit({
        agent: 'builder',
        status: 'recovering',
        message: 'Update incomplete — retrying with stricter patch instructions…',
        swarmStatusLabel: 'Recovering',
        swarmActivity: 'Retry patch',
        swarmTodos: todos('build'),
      });
      try {
        const retry = await callBuilderStream(
          route.builder,
          [
            { role: 'system', content: BUILDER_SYSTEM },
            {
              role: 'user',
              content: `${incrementalUpdateContext(selection.selected, {
                allPaths: prior.files.map((f) => f.path),
                cachedSummary,
                selectionNote: selection.reason,
                likelyDeletes,
              })}\n\nUser update (MUST use SEARCH/REPLACE or Delete File only):\n${userFacingPrompt}`,
            },
          ],
          {
            userId: opts.userId,
            maxTokens: 8192,
            temperature: 0.2,
            onDelta: opts.onDelta,
            signal: opts.signal,
            onModelFallback: emitModelSwitch,
          },
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
          if (applied.failed.length) {
            // Same contract as primary path — never half-apply to sticky repo
            patchFailures = applied.failureReasons;
            patchAborted = true;
            nextFiles = prior.files;
            usedPatches = false;
            emit({
              agent: 'reviewer',
              status: 'patch_aborted',
              message: `Recovery aborted — ${applied.failed.length} patch(es) missed SEARCH. Site unchanged.`,
              swarmStatusLabel: 'Aborted',
              swarmActivity: applied.failureReasons.slice(0, 2).join('; ') || 'SEARCH miss',
              swarmTodos: todos('build'),
            });
            trace.setMeta({ patchAborted: true, patchFailures });
          } else if (applied.applied.length) {
            nextFiles = applied.files;
            usedPatches = true;
          }
        }
        if (!patchAborted && !nextFiles.length) {
          const extracted = extractProjectFiles(retry.text);
          if (extracted.length) nextFiles = mergeFileMaps(prior.files, extracted);
        }
      } catch (err) {
        console.warn('[pipeline] recovery retry failed:', (err as Error).message);
      }
      if (!patchAborted && !nextFiles.length) nextFiles = prior.files;
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
      swarmTodos: todos('done').map((t) => ({ ...t, status: 'done' as const })),
    });
    const chatOut = {
      type: 'chat',
      content: result.text,
      modelLabel: MODELS[result.modelId].label,
      webSources: research?.sources,
    };
    const chatUsage = usageToTokenUsage(usage!);
    completeRun(runId, { output: chatOut, featureCategory: 'chat', tokenUsage: chatUsage });
    return {
      runId,
      success: true,
      featureCategory: route.kind === 'research' ? 'deep_research' : 'chat',
      output: chatOut,
      tokenUsage: chatUsage,
      followUps: isBuildPrompt(opts.prompt)
        ? ['Try again with more detail', 'Ask for HTML/CSS/JS output']
        : ['Ask a follow-up', 'Start a full build'],
      route,
    };
  }

  // Ensure landing trio for sandbox when we have html (skip for Expo/Next source trees)
  const isFrameworkOut = nextFiles.some(
    (f) =>
      f.path === 'package.json' ||
      f.path.startsWith('app/') ||
      f.path === 'app.json',
  );
  if (!isFrameworkOut) {
    if (finalSite.html.trim() && !nextFiles.some((f) => f.path === 'index.html')) {
      nextFiles = mergeFileMaps(
        nextFiles,
        landingFilesFromOutput(finalSite.html, finalSite.css, finalSite.js),
      );
    } else if (finalSite.html.trim()) {
      const synced = landingFilesFromOutput(finalSite.html, finalSite.css, finalSite.js);
      nextFiles = mergeFileMaps(synced, nextFiles);
    }
  }

  const projectName = isUpdate
    ? prior.projectName || projectNameFromPrompt(opts.prompt)
    : projectNameFromPrompt(opts.prompt);

  // New builds: merge deterministic scaffold under AI output
  // so user vault keys can power live /api routes and mobile/extension/desktop ship complete.
  let productScaffoldKind: ScaffoldKind = 'static';
  if (!isUpdate && nextFiles.length) {
    const scaffoldKind = detectScaffoldKind(userFacingPrompt);
    productScaffoldKind = scaffoldKind;
    if (
      scaffoldKind === 'nextjs' ||
      scaffoldKind === 'expo' ||
      scaffoldKind === 'chrome' ||
      scaffoldKind === 'electron'
    ) {
      const { files: scaffoldFiles } = buildScaffoldForPrompt({
        prompt: userFacingPrompt,
        projectName,
      });
      nextFiles = mergeScaffoldWithGenerated(scaffoldFiles, nextFiles);
      const integrity = ensureScaffoldIntegrity(scaffoldKind, scaffoldFiles, nextFiles);
      nextFiles = integrity.files;
      const features = detectScaffoldFeatures(userFacingPrompt);
      const featureBits = [
        features.crypto ? 'crypto prices + wallet demo' : null,
        features.agent ? 'automation agent + cron' : null,
      ].filter(Boolean);
      const scaffoldMessage =
        scaffoldKind === 'expo'
          ? 'Merged Android/iOS Expo scaffold under your build'
          : scaffoldKind === 'chrome'
            ? 'Merged Chrome MV3 extension scaffold (+ release zip after push)'
            : scaffoldKind === 'electron'
              ? 'Merged Electron desktop scaffold (+ GitHub Releases trigger)'
              : featureBits.length
                ? `Merged Next.js scaffold with ${featureBits.join(' · ')}`
                : 'Merged Next.js auth/API scaffold (vault keys → Vercel env)';
      emit({
        agent: 'builder',
        status: 'scaffolding',
        message:
          integrity.restored.length > 0
            ? `${scaffoldMessage} · restored ${integrity.restored.length} critical file(s)`
            : scaffoldMessage,
        swarmStatusLabel: 'Scaffold',
        swarmActivity: featureBits.length ? featureBits.join(', ') : scaffoldKind,
        swarmTodos: todos('build'),
      });
    }
  } else if (nextFiles.length) {
    // Updates: infer kind from tree so ship rules stay correct
    if (nextFiles.some((f) => f.path === 'manifest.json')) productScaffoldKind = 'chrome';
    else if (nextFiles.some((f) => f.path === 'app.json')) productScaffoldKind = 'expo';
    else {
      const pkg = nextFiles.find((f) => f.path === 'package.json')?.content ?? '';
      if (/"electron"/i.test(pkg) && !/"next"/i.test(pkg)) productScaffoldKind = 'electron';
      else if (/"next"/i.test(pkg)) productScaffoldKind = 'nextjs';
    }
  }

  const isNonWebProduct = isNonWebFrameworkScaffold(productScaffoldKind);

  previousFiles = prior.files.length ? prior.files : landingFilesFromOutput('', '', '');

  // QA review loop
  emit({
    agent: 'qa',
    status: 'reviewing',
    message: 'Reviewing build quality…',
    swarmStatusLabel: 'QA',
    swarmActivity: 'DeepSeek review',
    swarmTodos: todos('qa'),
  });
  throwIfAborted();
  const siteForQa = filesToSite(nextFiles);
  await assertCanUseModel(opts.userId, 'deepseek_v4_flash');
  emit({
    agent: 'reviewer',
    status: 'reviewing',
    message: 'Multi-agent review — structure + quality…',
    swarmStatusLabel: 'Reviewer',
    swarmActivity: 'Static validate + QA',
    swarmTodos: todos('qa'),
  });
  // Parallel-ish reviewer: static structure + LLM QA together
  const staticPre = staticValidateProject(nextFiles);
  let qa = await reviewBuildOutput({
    prompt: userFacingPrompt,
    html: siteForQa.html,
    css: siteForQa.css,
    js: siteForQa.js,
    isUpdate,
    files: nextFiles,
  });
  if (!staticPre.ok) {
    qa = {
      ...qa,
      ok: false,
      issues: [...staticPre.issues, ...qa.issues],
      fixHints: [...staticPre.fixHints, ...qa.fixHints],
    };
  }
  if (qa.inputTokens || qa.outputTokens) {
    usage = await recordUsage(
      opts.userId,
      'deepseek_v4_flash',
      qa.inputTokens,
      qa.outputTokens,
    );
  }

  // Real compile: npm install --ignore-scripts + tsc --noEmit (framework projects)
  throwIfAborted();
  emit({
    agent: 'compiler',
    status: 'compiling',
    message: 'Compile validate — npm install + tsc…',
    swarmStatusLabel: 'Compile',
    swarmActivity: 'Sandbox tsc',
    swarmTodos: todos('compile'),
  });
  let compile = await compileValidateProject(nextFiles, { signal: opts.signal });
  if (!compile.skipped && !compile.ok) {
    qa = {
      ...qa,
      ok: false,
      issues: [...qa.issues, ...compile.issues.map((i) => `compile: ${i}`)],
      fixHints: [
        ...qa.fixHints,
        'Fix TypeScript/compile errors before ship',
        ...compile.issues.slice(0, 3),
      ],
    };
    emit({
      agent: 'compiler',
      status: 'compile_failed',
      message: compile.issues.slice(0, 3).join('; ') || 'Compile failed',
      swarmStatusLabel: 'Compile failed',
      swarmActivity: `${compile.durationMs}ms`,
      swarmTodos: todos('compile'),
    });
  } else {
    emit({
      agent: 'compiler',
      status: compile.skipped ? 'skipped' : 'compiled',
      message: compile.skipped
        ? 'Compile skipped (static site)'
        : `Compile OK · install ${compile.installOk ? '✓' : '✗'} · tsc ${compile.tscOk ? '✓' : '✗'}`,
      swarmStatusLabel: compile.skipped ? 'Compile skip' : 'Compiled',
      swarmActivity: `${compile.durationMs}ms`,
      swarmTodos: todos('compile'),
    });
  }
  trace.setMeta({ compile: { ok: compile.ok, skipped: compile.skipped, issues: compile.issues } });

  // One fix pass if QA/compile failed and we have fix hints
  if (!qa.ok && qa.fixHints.length && !opts.signal?.aborted) {
    emit({
      agent: 'builder',
      status: 'fixing',
      message: 'QA found issues — applying fix pass…',
      swarmStatusLabel: 'Fixing',
      swarmActivity: qa.issues.slice(0, 2).join('; ') || 'QA fixes',
      swarmTodos: todos('qa'),
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
        {
          userId: opts.userId,
          maxTokens: 12288,
          temperature: 0.25,
          onDelta: opts.onDelta,
          signal: opts.signal,
          onModelFallback: emitModelSwitch,
        },
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
          const qaBase = nextFiles;
          const applied = applyPatches(qaBase, patches);
          if (applied.failed.length) {
            // Do not half-apply QA patches onto a sticky update
            emit({
              agent: 'reviewer',
              status: 'qa_patch_skipped',
              message: `QA fix skipped — ${applied.failed.length} patch(es) missed SEARCH. Keeping prior update files.`,
              swarmStatusLabel: 'QA patch skip',
              swarmActivity: applied.failureReasons.slice(0, 2).join('; ') || 'SEARCH miss',
              swarmTodos: todos('qa'),
            });
          } else if (applied.applied.length) {
            nextFiles = applied.files;
          }
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
        files: nextFiles,
      });
      if (qa.inputTokens || qa.outputTokens) {
        usage = await recordUsage(
          opts.userId,
          'deepseek_v4_flash',
          qa.inputTokens,
          qa.outputTokens,
        );
      }
      // Re-compile after fix pass
      compile = await compileValidateProject(nextFiles, { signal: opts.signal });
      if (!compile.skipped && !compile.ok) {
        qa = {
          ...qa,
          ok: false,
          issues: [...qa.issues, ...compile.issues.map((i) => `compile: ${i}`)],
        };
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
        ...(prior.fromMemory ? ['Used project memory (no full repo re-read)'] : []),
        ...(usedPatches ? ['Applied surgical SEARCH/REPLACE patches'] : []),
        ...(deletedPaths.length ? [`Deleted ${deletedPaths.join(', ')}`] : []),
        ...(patchFailures.length
          ? [`Skipped unsafe patches: ${patchFailures.slice(0, 3).join('; ')}`]
          : []),
        ...(selection.reason ? [selection.reason] : []),
        ...changesFromTrail(effectiveTrail, userFacingPrompt),
        ...(qa.issues.length ? [`QA notes: ${qa.issues.slice(0, 2).join('; ')}`] : []),
      ]
    : [
        `Built ${projectName}`,
        `${nextFiles.length} project files`,
        ...(detectScaffoldKind(userFacingPrompt) !== 'static'
          ? [`Scaffold: ${detectScaffoldKind(userFacingPrompt)}`]
          : []),
        ...(qa.issues.length ? [`QA notes: ${qa.issues.slice(0, 2).join('; ')}`] : []),
      ];

  // Server-side GitHub push + Vercel deploy
  let githubRepoUrl: string | undefined;
  let githubRepoName = meta?.githubTargetRepo;
  let githubPushConfirmed = false;
  let commitSha: string | undefined;
  const priorCommitSha =
    getProjectMemory(opts.userId, meta?.githubTargetRepo, meta?.githubTargetBranch)?.commitSha;
  let githubBranch = meta?.githubTargetBranch || 'main';
  let deployUrl = '';
  let deployVerified = false;
  let vercelPreviewUrl: string | undefined;

  // Placeholders only (.env.example / SECRETS.md) — never plaintext vault secrets in Git
  try {
    const secretDocs = await buildProviderEnvFiles(opts.userId);
    if (secretDocs.length) {
      const byPath = new Map(nextFiles.map((f) => [f.path, f]));
      for (const f of secretDocs) byPath.set(f.path, f);
      nextFiles = Array.from(byPath.values());
    }
  } catch (err) {
    console.warn('[pipeline] secret docs skipped:', (err as Error).message);
  }

  // Auto-provision user's Supabase (schema + AI memory + storage) when connected
  try {
    const { getUserProviderKey } = await import('../services/integrations/userProviderKeys.js');
    const { provisionUserSupabase } = await import('../services/integrations/supabaseProvision.js');
    const [sbUrl, sbService, sbDb] = await Promise.all([
      getUserProviderKey(opts.userId, 'supabase_url'),
      getUserProviderKey(opts.userId, 'supabase'),
      getUserProviderKey(opts.userId, 'supabase_db_password'),
    ]);
    const { getUserSupabaseManagementToken } = await import(
      '../services/integrations/supabaseProvision.js'
    );
    const sbPat = await getUserSupabaseManagementToken(opts.userId);
    if (sbUrl && sbService && (sbPat || sbDb)) {
      emit({
        agent: 'deploy',
        status: 'provisioning_supabase',
        message: 'Setting up schema, AI memory & storage on your Supabase…',
        swarmStatusLabel: 'Supabase',
        swarmActivity: 'Auto-provision',
      });
      const provisioned = await provisionUserSupabase({
        projectUrl: sbUrl,
        serviceRoleKey: sbService,
        accessToken: sbPat || undefined,
        dbPassword: sbDb || undefined,
        projectName,
      });
      if (provisioned.ok) {
        emit({
          agent: 'deploy',
          status: 'supabase_ready',
          message: provisioned.message,
          swarmStatusLabel: 'Supabase ready',
          swarmActivity: provisioned.schemaApplied ? 'Memory on your project' : 'Storage ready',
        });
      }
    }
  } catch (err) {
    console.warn('[pipeline] supabase provision skipped:', (err as Error).message);
  }

  // Security agent — block critical secret leaks before GitHub push
  throwIfAborted();
  emit({
    agent: 'security',
    status: 'scanning',
    message: 'Scanning for secrets & risky patterns…',
    swarmStatusLabel: 'Security',
    swarmActivity: 'Pre-push scan',
    swarmTodos: todos('push'),
  });
  let security = scanProjectFiles(nextFiles);
  if (security.blocked) {
    nextFiles = redactCriticalSecrets(nextFiles);
    security = scanProjectFiles(nextFiles);
    emit({
      agent: 'security',
      status: security.blocked ? 'blocked' : 'redacted',
      message: security.blocked
        ? 'Critical secrets still present — push blocked'
        : 'Redacted secrets from files — safe to continue',
      swarmStatusLabel: security.blocked ? 'Blocked' : 'Redacted',
      swarmActivity: security.findings
        .filter((f) => f.severity === 'critical')
        .slice(0, 2)
        .map((f) => f.message)
        .join('; '),
      swarmTodos: todos('push'),
    });
  }
  trace.setMeta({
    securityFindings: security.findings.length,
    securityBlocked: security.blocked,
  });

  const githubOk = await isGitHubConnected(opts.userId);
  const vercelOk = Boolean(await getVercelToken(opts.userId));
  const supabaseStatus = await getUserSupabaseStatus(opts.userId).catch(() => ({
    connected: false,
    ready: false,
    provisioned: false,
    message: '',
  }));
  const compileBlocksShip = !compile.skipped && compile.ok === false;
  // Re-check structure right before push (after QA fix passes may have changed files)
  const structureFinal = staticValidateProject(nextFiles);
  const qaBlocksShip = !structureFinal.ok;
  const shipBlockers: string[] = [];
  if (!githubOk) shipBlockers.push('Connect GitHub to push code to your repo');
  if (!isNonWebProduct && !vercelOk) {
    shipBlockers.push('Connect Vercel to deploy live to your account');
  }
  if (isUpdate && githubOk && !meta?.githubTargetRepo) {
    shipBlockers.push(
      'Update mode needs your ship repo. After the first build we remember it — or pick it once in Terminal.',
    );
  }
  if (patchAborted) shipBlockers.push('Unsafe patches aborted — live site unchanged');
  if (security.blocked) shipBlockers.push('Critical secrets blocked the push');
  if (compileBlocksShip) shipBlockers.push('Compile failed — fix TypeScript/install before ship');
  if (qaBlocksShip) {
    shipBlockers.push(
      `Critical structure: ${structureFinal.issues[0] || 'fix project files before ship'}`,
    );
  }
  // Informational — does not block fullyShipped (sites can ship without DB)
  const supabaseNote = supabaseStatus.provisioned
    ? 'Supabase provisioned on your project'
    : supabaseStatus.connected
      ? 'Supabase authorized — finish project pick/create for DB + memory'
      : null;

  let filesToPush = isUpdate ? (changedFiles.length ? changedFiles : []) : nextFiles;
  if (isUpdate && nextFiles.length) {
    const docs = nextFiles.filter((f) => f.path === '.env.example' || f.path === 'SECRETS.md');
    if (docs.length) {
      const byPath = new Map(filesToPush.map((f) => [f.path, f]));
      for (const f of docs) byPath.set(f.path, f);
      filesToPush = Array.from(byPath.values());
    }
  }

  // Expo: auto-link/create EAS project and stamp app.json before GitHub push
  if (productScaffoldKind === 'expo' && githubOk) {
    const expoToken = await getUserProviderKey(opts.userId, 'expo').catch(() => null);
    if (expoToken) {
      emit({
        agent: 'deploy',
        status: 'eas_link',
        message: 'Linking Expo / EAS project…',
        swarmStatusLabel: 'EAS link',
        swarmActivity: projectName,
        swarmTodos: todos('push'),
      });
      const linked = await ensureExpoProjectLinked({
        userId: opts.userId,
        projectName,
      });
      if (linked.projectId) {
        nextFiles = patchExpoProjectIdInFiles(nextFiles, linked.projectId);
        filesToPush = patchExpoProjectIdInFiles(filesToPush, linked.projectId);
        emit({
          agent: 'deploy',
          status: 'eas_linked',
          message: linked.message,
          swarmStatusLabel: linked.created ? 'EAS created' : 'EAS linked',
          swarmActivity: linked.projectId.slice(0, 12),
          swarmTodos: todos('push'),
        });
      } else if (linked.error === 'NEED_PROJECT_PICK') {
        emit({
          agent: 'deploy',
          status: 'eas_pick',
          message: linked.message,
          swarmStatusLabel: 'Pick Expo app',
          swarmActivity: 'Publish → select project',
          swarmTodos: todos('push'),
        });
      }
    }
  }

  // Updates must target the same repo — never create a new repo for edit/delete
  // Abort push when patches failed or secrets still blocked
  const shouldPush =
    githubOk &&
    !patchAborted &&
    !security.blocked &&
    !compileBlocksShip &&
    !qaBlocksShip &&
    (isUpdate ? Boolean(meta?.githubTargetRepo) : true) &&
    (filesToPush.length > 0 || deletedPaths.length > 0);

  if (qaBlocksShip) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message: `Push skipped — critical structure: ${structureFinal.issues[0] || 'fix files'}`,
      swarmStatusLabel: 'Structure block',
      swarmActivity: structureFinal.issues.slice(0, 2).join('; '),
      swarmTodos: todos('push'),
    });
  }

  if (compileBlocksShip) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message: 'Push skipped — compile failed. Fix TypeScript/install errors first.',
      swarmStatusLabel: 'Compile block',
      swarmActivity: compile.issues.slice(0, 2).join('; ') || 'tsc failed',
      swarmTodos: todos('push'),
    });
  }

  if (isUpdate && githubOk && !meta?.githubTargetRepo) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message:
        'No target repo yet. Ship once (we create + remember it), or pick your live repo in Terminal — updates never invent a new repo.',
      swarmStatusLabel: 'Need repo',
      swarmActivity: 'Pick or ship once',
      swarmTodos: todos('push'),
    });
  }
  if (patchAborted) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message: 'Push skipped — unsafe patches aborted; your live site was not changed.',
      swarmStatusLabel: 'Protected',
      swarmActivity: 'No push',
      swarmTodos: todos('push'),
    });
  }

  if (shouldPush) {
    emit({
      agent: 'deploy',
      status: 'pushing',
      message: meta?.githubTargetRepo
        ? `Pushing ${filesToPush.length} change(s)${deletedPaths.length ? ` · delete ${deletedPaths.length}` : ''} to ${meta.githubTargetRepo}…`
        : `Pushing ${filesToPush.length} file(s) to GitHub…`,
      swarmStatusLabel: 'Pushing',
      swarmActivity: meta?.githubTargetRepo || 'GitHub',
      swarmTodos: todos('push'),
    });
    try {
      const pushed = await pushBuildToGitHub(opts.userId, filesToPush, {
        targetRepo: meta?.githubTargetRepo,
        targetBranch: githubBranch,
        slug: `xroga-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        deletePaths: deletedPaths,
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
        swarmTodos: todos('push'),
      });
    }
  }

  // Free-path artifacts for Chrome / Electron after sticky push
  let chromeZipDownloadUrl: string | undefined;
  let chromeReleaseUrl: string | undefined;
  let chromeZipError: string | undefined;
  let desktopReleaseTag: string | undefined;
  let desktopActionsUrl: string | undefined;
  let desktopReleasesUrl: string | undefined;
  let desktopZipDownloadUrl: string | undefined;
  let desktopInstallerDownloadUrl: string | undefined;
  let electronReleaseError: string | undefined;
  let chromeZipOk = false;
  let electronZipOk = false;
  let electronInstallerOk = false;
  let easTriggered = false;
  let easUrl: string | undefined;
  let easError: string | undefined;
  let chromeStoreSubmitted = false;
  let chromeStoreUrl: string | undefined;
  let chromeStoreError: string | undefined;
  let easBuildOk = false;
  let easArtifactUrl: string | undefined;
  let easStoreSubmitted = false;

  if (githubPushConfirmed && githubRepoName && productScaffoldKind === 'chrome') {
    emit({
      agent: 'deploy',
      status: 'packaging',
      message: 'Packaging Chrome extension.zip on GitHub Releases…',
      swarmStatusLabel: 'Extension zip',
      swarmActivity: githubRepoName,
      swarmTodos: todos('push'),
    });
    try {
      const zipped = await shipChromeExtensionZip({
        userId: opts.userId,
        repoFullName: githubRepoName,
        files: nextFiles,
      });
      if (zipped.ok && zipped.downloadUrl) {
        chromeZipOk = true;
        chromeZipDownloadUrl = zipped.downloadUrl;
        chromeReleaseUrl = zipped.releaseUrl;
        emit({
          agent: 'deploy',
          status: 'packaged',
          message: `extension.zip ready — ${zipped.downloadUrl}`,
          swarmStatusLabel: 'Zip ready',
          swarmActivity: zipped.tag || 'extension.zip',
          swarmTodos: todos('push'),
        });

        // Real CWS submit when user connected Chrome Web Store OAuth
        try {
          const zipBuf = packageBuildZip(nextFiles, { include: chromeExtensionZipFilter });
          emit({
            agent: 'deploy',
            status: 'cws_submit',
            message: 'Submitting extension.zip to Chrome Web Store…',
            swarmStatusLabel: 'CWS submit',
            swarmActivity: 'upload + publish',
            swarmTodos: todos('push'),
          });
          const cws = await publishChromeExtensionToStore({
            userId: opts.userId,
            zip: zipBuf,
          });
          if (cws.submitted) {
            chromeStoreSubmitted = true;
            chromeStoreUrl = cws.dashboardUrl;
            emit({
              agent: 'deploy',
              status: 'cws_submitted',
              message: cws.message,
              swarmStatusLabel: 'CWS submitted',
              swarmActivity: cws.dashboardUrl || 'awaiting Google review',
              swarmTodos: todos('push'),
            });
          } else if (cws.error && cws.error !== 'NO_CWS_CREDS') {
            chromeStoreError = cws.message;
            emit({
              agent: 'deploy',
              status: 'cws_failed',
              message: cws.message,
              swarmStatusLabel: 'CWS failed',
              swarmActivity: cws.message.slice(0, 100),
              swarmTodos: todos('push'),
            });
          } else if (cws.error === 'NO_CWS_CREDS') {
            chromeStoreError = cws.message;
          }
        } catch (err) {
          chromeStoreError = (err as Error).message;
        }
      } else {
        chromeZipError = zipped.error || 'extension.zip upload failed';
        chromeReleaseUrl = zipped.releaseUrl;
        emit({
          agent: 'deploy',
          status: 'package_failed',
          message: chromeZipError,
          swarmStatusLabel: 'Zip failed',
          swarmActivity: chromeZipError.slice(0, 100),
          swarmTodos: todos('push'),
        });
      }
    } catch (err) {
      chromeZipError = (err as Error).message;
      console.warn('[pipeline] chrome zip:', chromeZipError);
      emit({
        agent: 'deploy',
        status: 'package_failed',
        message: chromeZipError,
        swarmStatusLabel: 'Zip failed',
        swarmActivity: chromeZipError.slice(0, 100),
        swarmTodos: todos('push'),
      });
    }
  }

  if (githubPushConfirmed && githubRepoName && productScaffoldKind === 'electron') {
    // Immediate portable zip so users never wait on Actions for a usable handoff
    emit({
      agent: 'deploy',
      status: 'packaging',
      message: 'Packaging desktop.zip (portable — npm install && npm start)…',
      swarmStatusLabel: 'Desktop zip',
      swarmActivity: githubRepoName,
      swarmTodos: todos('push'),
    });
    try {
      const portable = await shipElectronPortableZip({
        userId: opts.userId,
        repoFullName: githubRepoName,
        files: nextFiles,
      });
      if (portable.ok && portable.downloadUrl) {
        electronZipOk = true;
        desktopZipDownloadUrl = portable.downloadUrl;
        desktopReleasesUrl = portable.releaseUrl;
        desktopReleaseTag = portable.tag;
        emit({
          agent: 'deploy',
          status: 'zip_ready',
          message: `desktop.zip ready — ${portable.downloadUrl}`,
          swarmStatusLabel: 'Zip ready',
          swarmActivity: portable.tag || 'desktop.zip',
          swarmTodos: todos('push'),
        });
      } else {
        electronReleaseError = portable.error || 'desktop.zip upload failed';
        desktopReleasesUrl = portable.releaseUrl;
      }
    } catch (err) {
      electronReleaseError = (err as Error).message;
      console.warn('[pipeline] electron portable zip:', electronReleaseError);
    }

    // Sync signing secrets then kick multi-OS Actions for real installers
    emit({
      agent: 'deploy',
      status: 'releasing',
      message: 'Syncing signing secrets + starting multi-OS installer builds…',
      swarmStatusLabel: 'Desktop Actions',
      swarmActivity: githubRepoName,
      swarmTodos: todos('push'),
    });
    try {
      await syncElectronSigningSecretsToGitHub({
        userId: opts.userId,
        repoFullName: githubRepoName,
      });
      const released = await triggerElectronDesktopRelease({
        userId: opts.userId,
        repoFullName: githubRepoName,
        commitSha,
      });
      desktopReleaseTag = released.tag || desktopReleaseTag;
      desktopActionsUrl = released.actionsUrl;
      if (released.releasesUrl) desktopReleasesUrl = released.releasesUrl;
      if (released.ok) {
        const waited = await waitForDesktopReleaseZip({
          userId: opts.userId,
          repoFullName: githubRepoName,
          tag: released.tag,
          timeoutMs: 10 * 60 * 1000,
          intervalMs: 20_000,
          onProgress: (msg) => {
            emit({
              agent: 'deploy',
              status: 'waiting_zip',
              message: msg,
              swarmStatusLabel: 'Installers',
              swarmActivity: desktopActionsUrl || 'Actions',
              swarmTodos: todos('push'),
            });
          },
        });
        if (waited.ok && waited.zipDownloadUrl) {
          electronInstallerOk = Boolean(
            waited.installerUrls?.some((u) => /\.(exe|AppImage|dmg|msi)(\?|$)/i.test(u)) ||
              /\.(exe|AppImage|dmg|msi)(\?|$)/i.test(waited.zipDownloadUrl),
          );
          desktopInstallerDownloadUrl = waited.zipDownloadUrl;
          // Keep portable desktop.zip URL; installer is a separate download
          if (!desktopZipDownloadUrl) desktopZipDownloadUrl = waited.zipDownloadUrl;
          if (waited.releaseUrl) desktopReleasesUrl = waited.releaseUrl;
          emit({
            agent: 'deploy',
            status: 'zip_ready',
            message: electronInstallerOk
              ? `Desktop installer ready — ${waited.zipDownloadUrl}`
              : `Desktop package ready — ${waited.zipDownloadUrl}`,
            swarmStatusLabel: electronInstallerOk ? 'Installer ready' : 'Package ready',
            swarmActivity: waited.zipDownloadUrl.slice(0, 80),
            swarmTodos: todos('push'),
          });
        } else if (!electronZipOk) {
          electronReleaseError =
            waited.error ||
            'Installers still building on Actions — portable desktop.zip is ready above';
        }
      } else if (!electronZipOk) {
        electronReleaseError = released.error || 'Could not start desktop release';
      }
    } catch (err) {
      if (!electronZipOk) {
        electronReleaseError = (err as Error).message;
      }
      console.warn('[pipeline] electron release:', (err as Error).message);
    }

    if (!electronZipOk && electronReleaseError) {
      emit({
        agent: 'deploy',
        status: 'release_failed',
        message: electronReleaseError,
        swarmStatusLabel: 'Zip failed',
        swarmActivity: electronReleaseError.slice(0, 100),
        swarmTodos: todos('push'),
      });
    }
  }

  // Expo: auto-trigger EAS build, poll artifact, optionally submit when store creds synced
  if (githubPushConfirmed && productScaffoldKind === 'expo') {
    const expoToken = await getUserProviderKey(opts.userId, 'expo').catch(() => null);
    if (expoToken) {
      // Best-effort: push store credentials into Expo before submit
      const google = await getUserProviderKey(opts.userId, 'google_play').catch(() => null);
      const appleAsc = await getUserProviderKey(opts.userId, 'apple_asc_api').catch(() => null);
      const pkgId = packageIdFromProjectName(projectName);
      if (google) {
        const synced = await syncGooglePlayCredentialsToExpo({
          userId: opts.userId,
          applicationIdentifier: pkgId,
          projectName,
        });
        emit({
          agent: 'deploy',
          status: synced.ok ? 'eas_creds' : 'eas_creds_skip',
          message: synced.message,
          swarmStatusLabel: synced.ok ? 'Play creds synced' : 'Play creds',
          swarmActivity: synced.message.slice(0, 80),
          swarmTodos: todos('push'),
        });
      }
      if (appleAsc) {
        const syncedApple = await syncAppleAscApiKeyToExpo({
          userId: opts.userId,
          bundleIdentifier: pkgId,
          projectName,
        });
        emit({
          agent: 'deploy',
          status: syncedApple.ok ? 'eas_apple_creds' : 'eas_apple_creds_skip',
          message: syncedApple.message,
          swarmStatusLabel: syncedApple.ok ? 'Apple ASC synced' : 'Apple ASC',
          swarmActivity: syncedApple.message.slice(0, 80),
          swarmTodos: todos('push'),
        });
      }

      const wantAndroidSubmit = Boolean(google);
      const wantIosSubmit = Boolean(appleAsc);
      const priorBuilds = await listEasBuilds({ userId: opts.userId, limit: 10 }).catch(() => []);
      const ignoreBuildIds = priorBuilds.map((b) => b.id);
      const startedAfterMs = Date.now() - 15_000;

      emit({
        agent: 'deploy',
        status: 'eas_dispatch',
        message: wantAndroidSubmit
          ? 'Starting EAS Android build + store submit on your Expo account…'
          : 'Starting EAS Android build on your Expo account…',
        swarmStatusLabel: 'EAS',
        swarmActivity: wantAndroidSubmit ? 'publish-android' : 'build-android',
        swarmTodos: todos('push'),
      });
      try {
        const eas = await triggerEasPublish({
          userId: opts.userId,
          platform: 'android',
          gitRef: githubBranch || 'main',
          submit: wantAndroidSubmit,
          projectName,
        });
        if (eas.ok) {
          easTriggered = true;
          easUrl = eas.url;
          easStoreSubmitted = wantAndroidSubmit && /publish|submit/i.test(eas.fileName || '');
          emit({
            agent: 'deploy',
            status: 'eas_started',
            message: eas.message,
            swarmStatusLabel: 'EAS started',
            swarmActivity: eas.url || eas.fileName,
            swarmTodos: todos('push'),
          });

          const waited = await waitForEasBuildArtifact({
            userId: opts.userId,
            platform: 'android',
            timeoutMs: 8 * 60 * 1000,
            ignoreBuildIds,
            startedAfterMs,
            onProgress: (msg) => {
              emit({
                agent: 'deploy',
                status: 'eas_waiting',
                message: msg,
                swarmStatusLabel: 'EAS building',
                swarmActivity: easUrl || 'expo.dev',
                swarmTodos: todos('push'),
              });
            },
          });
          if (waited.ok && waited.build) {
            easBuildOk = true;
            easArtifactUrl =
              waited.build.artifactUrl || waited.build.buildDetailsPageUrl;
            emit({
              agent: 'deploy',
              status: 'eas_ready',
              message: waited.message,
              swarmStatusLabel: 'EAS binary ready',
              swarmActivity: easArtifactUrl?.slice(0, 80) || 'artifact',
              swarmTodos: todos('push'),
            });
          } else {
            easError = waited.message;
          }
        } else {
          easError = eas.message || eas.error || 'EAS dispatch failed';
          emit({
            agent: 'deploy',
            status: 'eas_skipped',
            message: easError,
            swarmStatusLabel: 'EAS needs setup',
            swarmActivity: easError.slice(0, 100),
            swarmTodos: todos('push'),
          });
        }

        // iOS path when ASC API key is in vault (parallel store track — does not block Android)
        if (wantIosSubmit) {
          emit({
            agent: 'deploy',
            status: 'eas_ios_dispatch',
            message: 'Starting EAS iOS build + App Store submit on your Expo account…',
            swarmStatusLabel: 'EAS iOS',
            swarmActivity: 'publish-ios',
            swarmTodos: todos('push'),
          });
          const easIos = await triggerEasPublish({
            userId: opts.userId,
            platform: 'ios',
            gitRef: githubBranch || 'main',
            submit: true,
            projectName,
          });
          if (easIos.ok) {
            easTriggered = true;
            easUrl = easIos.url || easUrl;
            easStoreSubmitted = true;
            emit({
              agent: 'deploy',
              status: 'eas_ios_started',
              message: easIos.message,
              swarmStatusLabel: 'EAS iOS started',
              swarmActivity: easIos.url || easIos.fileName,
              swarmTodos: todos('push'),
            });
            const waitedIos = await waitForEasBuildArtifact({
              userId: opts.userId,
              platform: 'ios',
              timeoutMs: 6 * 60 * 1000,
              ignoreBuildIds,
              startedAfterMs,
              onProgress: (msg) => {
                emit({
                  agent: 'deploy',
                  status: 'eas_ios_waiting',
                  message: msg,
                  swarmStatusLabel: 'EAS iOS building',
                  swarmActivity: easUrl || 'expo.dev',
                  swarmTodos: todos('push'),
                });
              },
            });
            if (waitedIos.ok && waitedIos.build) {
              easBuildOk = true;
              if (!easArtifactUrl) {
                easArtifactUrl =
                  waitedIos.build.artifactUrl || waitedIos.build.buildDetailsPageUrl;
              }
              emit({
                agent: 'deploy',
                status: 'eas_ios_ready',
                message: waitedIos.message,
                swarmStatusLabel: 'EAS iOS ready',
                swarmActivity: (easArtifactUrl || '').slice(0, 80) || 'artifact',
                swarmTodos: todos('push'),
              });
            }
          } else {
            emit({
              agent: 'deploy',
              status: 'eas_ios_skipped',
              message: easIos.message || easIos.error || 'iOS EAS dispatch failed',
              swarmStatusLabel: 'EAS iOS',
              swarmActivity: (easIos.message || '').slice(0, 100),
              swarmTodos: todos('push'),
            });
          }
        }
      } catch (err) {
        easError = (err as Error).message;
        emit({
          agent: 'deploy',
          status: 'eas_error',
          message: easError,
          swarmStatusLabel: 'EAS error',
          swarmActivity: easError.slice(0, 100),
          swarmTodos: todos('push'),
        });
      }
    } else {
      easError = 'No Expo token — Connect Expo in Publish to start EAS builds automatically';
    }
  }

  // Refresh hot memory so next update skips GitHub/AI re-analyze
  if (nextFiles.length || deletedPaths.length) {
    if (isUpdate) {
      patchProjectMemory(
        opts.userId,
        meta?.githubTargetRepo,
        githubBranch,
        nextFiles,
        deletedPaths,
        { commitSha, projectName },
      );
    } else {
      setProjectMemory({
        userId: opts.userId,
        repo: githubRepoName || meta?.githubTargetRepo,
        branch: githubBranch,
        projectName,
        files: nextFiles,
        commitSha,
        aiSummary: cachedSummary,
      });
    }
  }

  // Vercel redeploy via file-upload API — does NOT require GitHub↔Vercel project link
  // Non-web products (Chrome / Electron / Expo) ship via Releases/EAS — never upload them to Vercel.
  const vercelToken = await getVercelToken(opts.userId);
  let vaultEnvSync: VercelEnvSyncResult | undefined;
  const canDeployVercel =
    !isNonWebProduct &&
    !patchAborted &&
    !security.blocked &&
    !compileBlocksShip &&
    Boolean(vercelToken) &&
    nextFiles.some(
      (f) =>
        f.path.endsWith('.html') ||
        f.path === 'index.html' ||
        f.path === 'package.json' ||
        f.path.endsWith('.tsx') ||
        f.path.endsWith('.jsx'),
    );
  if (canDeployVercel) {
    emit({
      agent: 'deploy',
      status: 'deploying',
      message: isUpdate
        ? 'Redeploying on your Vercel (no GitHub link required)…'
        : 'Deploying to your Vercel account…',
      swarmStatusLabel: 'Deploying',
      swarmActivity: 'Vercel file upload',
      swarmTodos: todos('push'),
    });
    try {
      const slug =
        (githubRepoName?.split('/').pop() || projectName)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) || 'xroga-build';
      const deployed = await deployToAllPlatforms(slug, nextFiles, opts.userId);
      vaultEnvSync = deployed.envSync ?? deployed.vercel?.envSync;
      if (vaultEnvSync && !vaultEnvSync.ok) {
        const detail =
          vaultEnvSync.error ||
          (vaultEnvSync.skipped?.length
            ? `skipped ${vaultEnvSync.skipped.join(', ')}`
            : 'unknown error');
        shipBlockers.push(`Vault → Vercel env sync failed: ${detail}`);
        emit({
          agent: 'deploy',
          status: 'env_sync_failed',
          message: `Vault secrets did not fully sync to Vercel: ${detail}`,
          swarmStatusLabel: 'Env sync issue',
          swarmActivity: detail.slice(0, 120),
          swarmTodos: todos('push'),
        });
      }
      if (deployed.deployUrl) {
        deployUrl = deployed.deployUrl;
        deployVerified = deployed.deployVerified;
        vercelPreviewUrl = deployed.vercel?.deployUrl || deployed.deployUrl;
      } else if (deployed.deployError) {
        emit({
          agent: 'deploy',
          status: 'deploy_failed',
          message: deployed.deployError,
          swarmStatusLabel: 'Deploy issue',
          swarmActivity: deployed.deployError.slice(0, 120),
          swarmTodos: todos('push'),
        });
      }
    } catch (err) {
      console.warn('[pipeline] Vercel deploy failed:', (err as Error).message);
      emit({
        agent: 'deploy',
        status: 'deploy_failed',
        message: `Vercel deploy failed: ${(err as Error).message}`,
        swarmStatusLabel: 'Deploy failed',
        swarmActivity: (err as Error).message.slice(0, 120),
        swarmTodos: todos('push'),
      });
    }
  }

  // Post-deploy verify — honest pass/fail (no force-green)
  let shipVerify: Awaited<ReturnType<typeof verifyShippedProduct>> | null = null;
  if (githubPushConfirmed || deployUrl) {
    throwIfAborted();
    const expectApi =
      !isNonWebProduct && nextFiles.some((f) => f.path.includes('app/api/'));
    emit({
      agent: 'verifier',
      status: 'verifying',
      message: isNonWebProduct
        ? 'Verifying GitHub + free-path artifacts (honest)…'
        : 'Verifying GitHub push + live URL + /api/health…',
      swarmStatusLabel: 'Verify',
      swarmActivity: deployUrl || githubRepoUrl || 'checks',
      swarmTodos: todos('push'),
    });
    shipVerify = await verifyShippedProduct({
      deployUrl: deployUrl || vercelPreviewUrl,
      githubPushConfirmed,
      githubRepoUrl,
      expectApiHealth: expectApi,
    });
    deployVerified = shipVerify.liveOk || deployVerified;
  }

  const outcome = computeShipOutcome({
    kind: productScaffoldKind,
    patchAborted,
    securityBlocked: security.blocked,
    compileBlocksShip,
    qaBlocksShip,
    githubConnected: githubOk,
    vercelConnected: vercelOk,
    shouldPush,
    githubPushConfirmed,
    deployUrl: deployUrl || undefined,
    liveOk: deployUrl ? Boolean(shipVerify?.liveOk ?? deployVerified) : undefined,
    chromeZipOk,
    chromeStoreSubmitted,
    chromeStoreUrl,
    chromeStoreError,
    electronZipOk,
    electronInstallerOk,
    easTriggered,
    easUrl,
    easBuildOk,
    easArtifactUrl,
    easStoreSubmitted,
    chromeZipError,
    electronReleaseError,
    easError,
    envSyncOk: vaultEnvSync ? vaultEnvSync.ok : undefined,
    envSyncError: vaultEnvSync && !vaultEnvSync.ok
      ? vaultEnvSync.error ||
        (vaultEnvSync.skipped?.length
          ? `skipped ${vaultEnvSync.skipped.slice(0, 6).join(', ')}`
          : 'env sync incomplete')
      : undefined,
  });

  // Merge pre-push blockers (e.g. missing sticky repo) that outcome may not know
  const finalBlockers = [...new Set([...outcome.shipBlockers, ...shipBlockers])];
  const fullyShipped = outcome.fullyShipped;
  const handoffReady = outcome.handoffReady;
  const buildOk = outcome.buildOk;
  // Honest API success: usable code is not enough when ship was required and blocked.
  // Soft "looks shipped" is forbidden — blockers mean the run did not succeed end-to-end.
  const shipUsable = fullyShipped || handoffReady;
  const overallSuccess =
    buildOk &&
    (shouldPush ? shipUsable && finalBlockers.length === 0 : finalBlockers.length === 0);
  const statusMessage = outcome.statusMessage;
  const freePathDone = shipUsable;

  const shipOutcomeMeta = {
    fullyShipped,
    handoffReady,
    buildOk,
    shipOk: outcome.shipOk,
    scaffoldKind: productScaffoldKind,
    blockers: finalBlockers,
    deployUrl: deployUrl || undefined,
    githubRepoName: githubRepoName || undefined,
    githubPushConfirmed,
    envSyncOk: vaultEnvSync ? vaultEnvSync.ok : undefined,
    storeSubmitted: outcome.storeSubmitted,
    statusLabel: outcome.statusLabel,
  };

  if (shipVerify || githubPushConfirmed || deployUrl) {
    const summaryLines = [
      ...outcome.verifyLines,
      ...(chromeZipDownloadUrl ? [`Download: ${chromeZipDownloadUrl}`] : []),
      ...(desktopZipDownloadUrl ? [`Download: ${desktopZipDownloadUrl}`] : []),
      ...(desktopActionsUrl && !desktopZipDownloadUrl ? [`Actions: ${desktopActionsUrl}`] : []),
      ...(easUrl ? [`EAS: ${easUrl}`] : []),
      ...(outcome.nextSteps.length
        ? outcome.nextSteps.map((s) => `➡️ ${s}`)
        : []),
      ...(shipVerify?.summaryLines?.filter(
        (l) => !outcome.verifyLines.some((v) => l.includes(v.slice(2))),
      ) || []),
    ];
    shipVerify = {
      liveOk: Boolean(shipVerify?.liveOk ?? deployVerified),
      liveUrl: shipVerify?.liveUrl || deployUrl || '',
      healthOk: shipVerify?.healthOk ?? null,
      healthBody: shipVerify?.healthBody,
      keysProof: shipVerify?.keysProof ?? {
        checked: false,
        message: isNonWebProduct ? 'Non-web free path — no /api/health expected' : 'No keys proof',
      },
      githubOk: githubPushConfirmed,
      summaryLines,
      pass: outcome.verifyPass,
    };
    emit({
      agent: 'verifier',
      status: outcome.verifyPass ? 'verified' : 'verify_failed',
      message: summaryLines.join('\n'),
      swarmStatusLabel: outcome.verifyPass ? outcome.statusLabel : 'Incomplete',
      swarmActivity: outcome.verifyPass
        ? outcome.statusLabel
        : finalBlockers[0] || 'See ship blockers',
      swarmTodos: todos('done').map((t) => ({
        ...t,
        status: (outcome.verifyPass ? 'done' : 'pending') as 'done' | 'pending',
      })),
    });
    trace.setMeta({
      shipVerify: summaryLines,
      fullyShipped,
      buildOk,
      shipOutcome: shipOutcomeMeta,
    });
  }

  const outSite = filesToSite(nextFiles);

  emit({
    agent: 'builder',
    status: fullyShipped
      ? 'complete'
      : handoffReady
        ? 'complete_handoff'
        : buildOk
          ? 'complete_incomplete_ship'
          : 'complete_with_errors',
    message: statusMessage,
    swarmStatusLabel: freePathDone
      ? outcome.statusLabel
      : buildOk
        ? 'Built · incomplete'
        : 'Needs attention',
    swarmActivity: shipVerify?.summaryLines?.[0] ||
      (deployVerified
        ? `Live · ${deployUrl}`
        : githubPushConfirmed
          ? `Pushed to ${githubRepoName}`
          : finalBlockers[0] || 'Preview ready'),
    swarmTodos: todos('done').map((t) => ({
      ...t,
      // Non-web handoff still leaves store/signing work pending
      status: (fullyShipped ? 'done' : 'pending') as 'done' | 'pending',
    })),
  });

  const verifyMarkdown = shipVerify?.summaryLines?.length
    ? `\n\n### Ship check\n${shipVerify.summaryLines.join('\n')}`
    : '';
  const blockersMarkdown = finalBlockers.length
    ? `\n\n### Ship blockers\n${finalBlockers.map((b) => `- ${b}`).join('\n')}`
    : '';
  const nextStepsMarkdown = outcome.nextSteps.length
    ? `\n\n### Next steps\n${outcome.nextSteps.map((s) => `- ${s}`).join('\n')}`
    : '';
  const compileMarkdown =
    !compile.skipped
      ? `\n\n### Compile\n${compile.ok ? '✅' : '❌'} npm install ${compile.installOk ? 'OK' : 'FAIL'} · tsc ${compile.tscOk ? 'OK' : 'FAIL'}${
          compile.issues.length ? `\n${compile.issues.slice(0, 5).map((i) => `- ${i}`).join('\n')}` : ''
        }`
      : `\n\n### Structure\n${structureFinal.ok ? '✅' : '❌'} ${structureFinal.issues.slice(0, 3).join('; ') || compile.reason || 'skipped compile'}`;

  const output: Record<string, unknown> = {
    type: 'landing_page',
    html: outSite.html,
    css: outSite.css,
    js: outSite.js,
    projectFiles: nextFiles.map((f) => ({ path: f.path, content: f.content })),
    generatedFiles: nextFiles.map((f) => f.path),
    fileCount: nextFiles.length,
    projectName,
    message: (
      (patchAborted
        ? `⚠️ **Update aborted** for **${projectName}** — patches did not match safely. Your live site was **not** changed.`
        : fullyShipped
          ? isUpdate
            ? `Updated **${projectName}** — pushed to GitHub and live on Vercel.`
            : `Shipped **${projectName}** — pushed to GitHub and live on Vercel.`
          : handoffReady
            ? productScaffoldKind === 'chrome'
              ? chromeStoreSubmitted
                ? `**${projectName}** submitted to Chrome Web Store — awaiting Google review.`
                : `**${projectName}** extension.zip ready. Connect CWS credentials in Publish to submit for review.`
              : productScaffoldKind === 'electron'
                ? electronInstallerOk
                  ? `**${projectName}** desktop installer ready to download.`
                  : `**${projectName}** portable zip ready; installers building on GitHub Actions.`
                : productScaffoldKind === 'expo'
                  ? easBuildOk
                    ? `**${projectName}** EAS binary ready${easStoreSubmitted ? ' + store submit started (awaiting Apple/Google)' : ''}.`
                    : `**${projectName}** on GitHub${easTriggered ? ' + EAS building' : ' — Connect Expo to auto-build'}.`
                  : `**${projectName}** handoff ready.`
            : buildOk
              ? `Built **${projectName}** — **not fully shipped.** ${finalBlockers[0] || 'Finish integrations / artifacts below.'}`
              : `⚠️ **${projectName}** finished with blockers — see ship check below.`) +
      verifyMarkdown +
      blockersMarkdown +
      nextStepsMarkdown +
      compileMarkdown
    ),
    modelLabel: MODELS[result.modelId].label,
    userPrompt: userFacingPrompt,
    isUpdate,
    usedSurgicalPatches: usedPatches,
    patchAborted,
    patchFailures: patchFailures.length ? patchFailures : undefined,
    updatedFiles: isUpdate ? effectiveTrail.map((f) => f.path) : undefined,
    architectPlan: architectPlanSummary,
    changesSummary: [
      ...changesSummary,
      ...(architectPlanSummary
        ? [`Architect: ${architectPlanSummary.stack} · ${architectPlanSummary.files.length} files`]
        : []),
      ...(compile.skipped
        ? [`Structure: ${structureFinal.ok ? 'ok' : 'blocked'}`]
        : [
            `Compile: ${compile.ok ? 'passed' : 'failed'} (${compile.durationMs}ms)`,
          ]),
      ...(shipVerify?.summaryLines || []),
      ...(security.findings.length
        ? [`Security: ${security.findings.length} finding(s)${security.blocked ? ' (blocked)' : ''}`]
        : []),
    ],
    fileTrail: effectiveTrail,
    previousFiles: isUpdate
      ? previousFiles.map((f) => ({ path: f.path, content: f.content }))
      : undefined,
    githubRepoUrl,
    githubRepoName,
    githubPushConfirmed,
    fullyShipped,
    handoffReady,
    storeSubmitted: outcome.storeSubmitted,
    buildOk,
    shipped: fullyShipped,
    shipOutcome: shipOutcomeMeta,
    nextSteps: outcome.nextSteps,
    scaffoldKind: productScaffoldKind,
    chromeZipDownloadUrl,
    chromeReleaseUrl,
    chromeStoreSubmitted,
    chromeStoreUrl,
    desktopReleaseTag,
    desktopActionsUrl,
    desktopReleasesUrl,
    desktopZipDownloadUrl,
    desktopInstallerDownloadUrl,
    electronInstallerOk,
    easTriggered,
    easUrl,
    easBuildOk,
    easArtifactUrl,
    easStoreSubmitted,
    shipBlockers: finalBlockers.length ? finalBlockers : undefined,
    supabase: {
      connected: Boolean(supabaseStatus.connected),
      provisioned: Boolean(supabaseStatus.provisioned || supabaseStatus.ready),
      note: supabaseNote || undefined,
    },
    commitSha,
    previousCommitSha: priorCommitSha,
    githubBranch,
    deployUrl,
    deployVerified: Boolean(shipVerify?.liveOk ?? deployVerified),
    vercelPreviewUrl,
    envSync: vaultEnvSync
      ? {
          ok: vaultEnvSync.ok,
          projectName: vaultEnvSync.projectName,
          upserted: vaultEnvSync.upserted,
          skipped: vaultEnvSync.skipped,
          error: vaultEnvSync.error,
        }
      : undefined,
    shipVerify,
    canRollback: Boolean(commitSha && githubRepoName),
    qa: {
      ok: qa.ok,
      issues: qa.issues,
      fixHints: qa.fixHints,
      staticKind: qa.staticKind,
    },
    compile: {
      ok: compile.ok,
      skipped: compile.skipped,
      installOk: compile.installOk,
      tscOk: compile.tscOk,
      issues: compile.issues,
      durationMs: compile.durationMs,
    },
    security: {
      ok: security.ok,
      blocked: security.blocked,
      findings: security.findings.slice(0, 20),
    },
    memoryHit: isUpdate ? prior.fromMemory : false,
    sessionMemoryLoaded: dbHistory.length,
    contextFiles: isUpdate ? selection.selected.map((f) => f.path) : undefined,
    deletedFiles: deletedPaths.length ? deletedPaths : undefined,
    runTrace: trace.summary(),
  };

  const finalUsage = usageToTokenUsage(usage!);
  completeRun(runId, {
    output,
    featureCategory: 'landing_page',
    tokenUsage: finalUsage,
    success: overallSuccess,
  });
  void trace.persist();
  void saveSessionHistory(opts.userId, githubRepoName || meta?.githubTargetRepo, [
    ...history,
    { role: 'user', content: userFacingPrompt },
    {
      role: 'assistant',
      content: String(output.message || '').slice(0, 6000),
    },
  ]);

  return {
    runId,
    success: overallSuccess,
    featureCategory: 'landing_page',
    output,
    tokenUsage: finalUsage,
    followUps: patchAborted
      ? ['Retry update with clearer instructions', 'Show current files', 'Open preview']
      : productScaffoldKind === 'chrome'
        ? chromeZipDownloadUrl
          ? ['Download extension.zip', 'Sideload in Chrome', 'Refine the extension']
          : ['Open GitHub Releases', 'Sideload from repo', 'Refine the extension']
        : productScaffoldKind === 'electron'
          ? [
              desktopZipDownloadUrl ? 'Download desktop zip' : 'Open GitHub Actions',
              desktopReleasesUrl ? 'Open GitHub Releases' : 'Run npm start locally',
              'Refine the desktop app',
            ]
          : productScaffoldKind === 'expo'
            ? ['Connect Expo in Publish', 'Open in Expo Go', 'Refine the mobile app']
            : isUpdate
              ? commitSha
                ? ['Rollback last commit', 'Make another tweak', 'Open preview']
                : ['Make another tweak', 'Open preview']
              : ['Refine the design', 'Add another feature', 'Open preview'],
    route,
  };
}
