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
} from '../services/integrations/githubDeploy.js';
import { getVercelToken } from '../services/integrations/vercelAuth.js';
import { getUserSupabaseStatus } from '../services/integrations/userProviderKeys.js';
import { buildProviderEnvFiles } from '../services/integrations/userProviderKeys.js';
import {
  buildScaffoldForPrompt,
  detectScaffoldKind,
  mergeScaffoldWithGenerated,
} from '../services/projectScaffold.js';
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
) {
  const steps = [
    { id: 'route', label: 'Route request' },
    { id: 'research', label: 'Gather research' },
    { id: 'convert', label: 'Convert to builder brief' },
    { id: 'architect', label: 'Architect file plan' },
    { id: 'build', label: 'Generate product' },
    { id: 'qa', label: 'Review quality' },
    { id: 'compile', label: 'Compile validate' },
    { id: 'push', label: 'Push & deploy' },
  ] as const;
  const order = [
    'route',
    'research',
    'convert',
    'architect',
    'build',
    'qa',
    'compile',
    'push',
  ] as const;
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
    if (ev.agent && ev.status) trace.add(ev.agent, ev.status, ev.message);
    opts.onProgress?.(ev);
  };
  const throwIfAborted = () => {
    if (opts.signal?.aborted) {
      const err = new Error('Build cancelled') as Error & { code?: string };
      err.code = 'BUILD_CANCELLED';
      throw err;
    }
  };
  const meta = parseClientMeta(opts.clientMeta);
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
      swarmTodos: todosForBuild('route'),
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
      swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
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
    swarmTodos: todosForBuild('route'),
  });

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
      swarmTodos: todosForBuild('route'),
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

  // Build/update with screenshot: Grok vision → text brief for the (non-vision) builder
  let designReference = '';
  if (preparedEarly.hasImages) {
    emit({
      agent: 'vision',
      status: 'analyzing',
      message: 'Reading attached image(s) with Grok for design/error context…',
      swarmStatusLabel: 'Vision',
      swarmActivity: 'Grok 4.3',
      swarmTodos: todosForBuild('convert'),
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
        { userId: opts.userId, maxTokens: 2048, temperature: 0.3, signal: opts.signal },
      );
      usage = await recordUsage(
        opts.userId,
        vision.modelId,
        vision.inputTokens,
        vision.outputTokens,
      );
      designReference = `\n\nDESIGN / SCREENSHOT REFERENCE (from Grok vision):\n${vision.text.slice(0, 6000)}`;
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
    swarmTodos: todosForBuild('convert'),
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

  // Architect agent — concrete file plan (real multi-agent stage)
  throwIfAborted();
  emit({
    agent: 'architect',
    status: 'planning',
    message: 'Architect planning file tree…',
    swarmStatusLabel: 'Architect',
    swarmActivity: 'File plan',
    swarmTodos: todosForBuild('architect'),
  });
  let architectBlock = '';
  let architectPlanSummary: { stack: string; files: string[]; notes: string[] } | undefined;
  try {
    await assertCanUseModel(opts.userId, 'deepseek_v4_flash');
    const plan = await runArchitectPlan({
      brief: converted.instruction,
      userPrompt: userFacingPrompt,
      isUpdate,
    });
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
      swarmTodos: todosForBuild('architect'),
    });
  } catch (err) {
    console.warn('[pipeline] architect failed (continuing):', (err as Error).message);
  }

  emit({
    agent: 'builder',
    status: 'building',
    message: isUpdate
      ? `Surgical update · ${selection.selected.length} files in context${prior.fromMemory ? ' · memory' : ''}`
      : `Building with ${MODELS[route.builder].label}…`,
    swarmStatusLabel: isUpdate ? 'Patching' : 'Building',
    swarmActivity: MODELS[route.builder].tagline,
    swarmTodos: todosForBuild('build'),
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
    },
  );

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
          swarmTodos: todosForBuild('build'),
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
  if (isUpdate && prior.files.length) {
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
        swarmTodos: todosForBuild('build'),
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

  // New builds: merge deterministic scaffold (auth/API or Expo) under AI output
  // so user vault keys can power live /api routes and mobile apps ship complete.
  if (!isUpdate && nextFiles.length) {
    const scaffoldKind = detectScaffoldKind(userFacingPrompt);
    if (scaffoldKind === 'nextjs' || scaffoldKind === 'expo') {
      const { files: scaffoldFiles } = buildScaffoldForPrompt({
        prompt: userFacingPrompt,
        projectName,
      });
      nextFiles = mergeScaffoldWithGenerated(scaffoldFiles, nextFiles);
      emit({
        agent: 'builder',
        status: 'scaffolding',
        message:
          scaffoldKind === 'expo'
            ? 'Merged Android/iOS Expo scaffold under your build'
            : 'Merged Next.js auth/API scaffold (vault keys → Vercel env)',
        swarmStatusLabel: 'Scaffold',
        swarmActivity: scaffoldKind,
        swarmTodos: todosForBuild('build'),
      });
    }
  }

  previousFiles = prior.files.length ? prior.files : landingFilesFromOutput('', '', '');

  // QA review loop
  emit({
    agent: 'qa',
    status: 'reviewing',
    message: 'Reviewing build quality…',
    swarmStatusLabel: 'QA',
    swarmActivity: 'DeepSeek review',
    swarmTodos: todosForBuild('qa'),
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
    swarmTodos: todosForBuild('qa'),
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
    swarmTodos: todosForBuild('compile'),
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
      swarmTodos: todosForBuild('compile'),
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
      swarmTodos: todosForBuild('compile'),
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
        {
          userId: opts.userId,
          maxTokens: 12288,
          temperature: 0.25,
          onDelta: opts.onDelta,
          signal: opts.signal,
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
    swarmTodos: todosForBuild('push'),
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
      swarmTodos: todosForBuild('push'),
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
  const shipBlockers: string[] = [];
  if (!githubOk) shipBlockers.push('Connect GitHub to push code to your repo');
  if (!vercelOk) shipBlockers.push('Connect Vercel to deploy live to your account');
  if (isUpdate && githubOk && !meta?.githubTargetRepo) {
    shipBlockers.push('Select the same GitHub repo to update (no new repo for edits)');
  }
  if (patchAborted) shipBlockers.push('Unsafe patches aborted — live site unchanged');
  if (security.blocked) shipBlockers.push('Critical secrets blocked the push');
  if (compileBlocksShip) shipBlockers.push('Compile failed — fix TypeScript/install before ship');
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
  // Updates must target the same repo — never create a new repo for edit/delete
  // Abort push when patches failed or secrets still blocked
  const shouldPush =
    githubOk &&
    !patchAborted &&
    !security.blocked &&
    !compileBlocksShip &&
    (isUpdate ? Boolean(meta?.githubTargetRepo) : true) &&
    (filesToPush.length > 0 || deletedPaths.length > 0);

  if (compileBlocksShip) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message: 'Push skipped — compile failed. Fix TypeScript/install errors first.',
      swarmStatusLabel: 'Compile block',
      swarmActivity: compile.issues.slice(0, 2).join('; ') || 'tsc failed',
      swarmTodos: todosForBuild('push'),
    });
  }

  if (isUpdate && githubOk && !meta?.githubTargetRepo) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message: 'Select the same GitHub repo to update (edit/delete) — no new repo will be created.',
      swarmStatusLabel: 'Need repo',
      swarmActivity: 'Pick target repo',
      swarmTodos: todosForBuild('push'),
    });
  }
  if (patchAborted) {
    emit({
      agent: 'deploy',
      status: 'push_skipped',
      message: 'Push skipped — unsafe patches aborted; your live site was not changed.',
      swarmStatusLabel: 'Protected',
      swarmActivity: 'No push',
      swarmTodos: todosForBuild('push'),
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
      swarmTodos: todosForBuild('push'),
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
        swarmTodos: todosForBuild('push'),
      });
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
  const vercelToken = await getVercelToken(opts.userId);
  const canDeployVercel =
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
          swarmTodos: todosForBuild('push'),
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
        swarmTodos: todosForBuild('push'),
      });
    }
  }

  // Post-deploy verify + keys proof (honest pass/fail in chat)
  let shipVerify: Awaited<ReturnType<typeof verifyShippedProduct>> | null = null;
  if (githubPushConfirmed || deployUrl) {
    throwIfAborted();
    emit({
      agent: 'verifier',
      status: 'verifying',
      message: 'Verifying GitHub push + live URL + /api/health…',
      swarmStatusLabel: 'Verify',
      swarmActivity: deployUrl || githubRepoUrl || 'checks',
      swarmTodos: todosForBuild('push'),
    });
    const expectApi = nextFiles.some((f) => f.path.includes('app/api/'));
    shipVerify = await verifyShippedProduct({
      deployUrl: deployUrl || vercelPreviewUrl,
      githubPushConfirmed,
      githubRepoUrl,
      expectApiHealth: expectApi,
    });
    deployVerified = shipVerify.liveOk || deployVerified;
    emit({
      agent: 'verifier',
      status: shipVerify.pass ? 'verified' : 'verify_failed',
      message: shipVerify.summaryLines.join('\n'),
      swarmStatusLabel: shipVerify.pass ? 'Verified' : 'Verify failed',
      swarmActivity: shipVerify.pass ? 'All checks green' : 'See chat for failures',
      swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
    });
    trace.setMeta({ shipVerify: shipVerify.summaryLines });
  }

  const outSite = filesToSite(nextFiles);

  const shipOk =
    !patchAborted &&
    !security.blocked &&
    !compileBlocksShip &&
    (shouldPush ? githubPushConfirmed : true) &&
    (deployUrl ? Boolean(shipVerify?.liveOk ?? deployVerified) : true);

  const fullyShipped =
    shipOk &&
    githubPushConfirmed &&
    Boolean(deployUrl) &&
    Boolean(shipVerify?.liveOk ?? deployVerified);

  const overallSuccess = shipOk && !patchAborted && (compile.skipped || compile.ok);

  const statusMessage = patchAborted
    ? 'Update aborted — site unchanged'
    : fullyShipped
      ? isUpdate
        ? 'Update shipped & verified'
        : 'Build shipped & verified'
      : githubPushConfirmed && !deployUrl
        ? 'Pushed to GitHub — connect Vercel to go live'
        : overallSuccess
          ? isUpdate
            ? 'Update ready (connect GitHub + Vercel to ship)'
            : 'Build ready (connect GitHub + Vercel to ship)'
          : shipBlockers.length
            ? `Build finished — ship blocked: ${shipBlockers[0]}`
            : 'Build finished with failures — see verify report';

  emit({
    agent: 'builder',
    status: overallSuccess ? 'complete' : 'complete_with_errors',
    message: statusMessage,
    swarmStatusLabel: fullyShipped ? 'Shipped' : overallSuccess ? 'Ready' : 'Needs attention',
    swarmActivity: shipVerify?.summaryLines?.[0] ||
      (deployVerified
        ? `Live · ${deployUrl}`
        : githubPushConfirmed
          ? `Pushed to ${githubRepoName}`
          : shipBlockers[0] || 'Preview ready'),
    swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
  });

  const verifyMarkdown = shipVerify?.summaryLines?.length
    ? `\n\n### Ship check\n${shipVerify.summaryLines.join('\n')}`
    : '';
  const blockersMarkdown = shipBlockers.length
    ? `\n\n### Ship blockers\n${shipBlockers.map((b) => `- ${b}`).join('\n')}`
    : '';
  const compileMarkdown =
    !compile.skipped
      ? `\n\n### Compile\n${compile.ok ? '✅' : '❌'} npm install ${compile.installOk ? 'OK' : 'FAIL'} · tsc ${compile.tscOk ? 'OK' : 'FAIL'}${
          compile.issues.length ? `\n${compile.issues.slice(0, 5).map((i) => `- ${i}`).join('\n')}` : ''
        }`
      : '';

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
            ? `Updated **${projectName}** with ${MODELS[result.modelId].label} — pushed to GitHub and live on Vercel.`
            : `Built **${projectName}** with ${MODELS[result.modelId].label} — pushed to GitHub and live on Vercel.`
          : overallSuccess
            ? `Built **${projectName}** with ${MODELS[result.modelId].label}.${shipBlockers.length ? ' Connect integrations below to finish shipping.' : ''}`
            : `⚠️ **${projectName}** finished with failures — check GitHub/Vercel status below.`) +
      verifyMarkdown +
      blockersMarkdown +
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
        ? []
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
    shipBlockers: shipBlockers.length ? shipBlockers : undefined,
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
      : isUpdate
        ? commitSha
          ? ['Rollback last commit', 'Make another tweak', 'Open preview']
          : ['Make another tweak', 'Open preview']
        : ['Refine the design', 'Add another feature', 'Open preview'],
    route,
  };
}
