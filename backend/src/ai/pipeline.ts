import { randomUUID } from 'crypto';
import { convertUserRequest } from './converter.js';
import { MODELS, type ModelId } from './models.js';
import { chatCompletion, type ChatMessage } from './openaiCompat.js';
import {
  BUILDER_SYSTEM,
  CHAT_SYSTEM,
  researchSynthesisPrompt,
} from './prompts.js';
import { assertHasQuota, recordUsage, usageToTokenUsage, type UsageSnapshot } from './quota.js';
import { formatResearchForPrompt, gatherResearch, type ResearchBundle } from './research.js';
import { isBuildPrompt, routePrompt, type RouteDecision } from './router.js';
import { extractSiteFiles, siteLooksComplete } from './siteBuilder.js';

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

function todosForBuild(step: 'route' | 'research' | 'convert' | 'build' | 'done') {
  const steps = [
    { id: 'route', label: 'Route request' },
    { id: 'research', label: 'Gather research' },
    { id: 'convert', label: 'Convert to builder brief' },
    { id: 'build', label: 'Generate product' },
  ] as const;
  const order = ['route', 'research', 'convert', 'build'] as const;
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
 */
export async function runBuildPipeline(opts: {
  userId: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  projectId?: string;
  onProgress?: ProgressFn;
  onDelta?: DeltaFn;
  signal?: AbortSignal;
}): Promise<BuildPipelineResult> {
  const runId = randomUUID();
  const emit = (ev: PipelineProgress) => opts.onProgress?.(ev);

  await assertHasQuota(opts.userId);
  const route = routePrompt(opts.prompt);

  emit({
    agent: 'router',
    status: 'routing',
    message: route.reason,
    swarmStatusLabel: 'Routing',
    swarmActivity: `Assigning ${MODELS[route.builder].label}`,
    swarmTodos: todosForBuild('route'),
  });

  let researchBlock = '';
  let research: ResearchBundle | null = null;
  if (route.useResearch) {
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
    message: 'Converting your request into a builder brief…',
    swarmStatusLabel: 'Briefing',
    swarmActivity: `Converter · ${MODELS[route.converter].label}`,
    swarmTodos: todosForBuild('convert'),
  });

  const converted = await convertUserRequest(opts.prompt, researchBlock || undefined);
  let usage: UsageSnapshot = await recordUsage(
    opts.userId,
    'deepseek_v4_flash',
    converted.inputTokens,
    converted.outputTokens,
  );

  emit({
    agent: 'builder',
    status: 'building',
    message: `Building with ${MODELS[route.builder].label}…`,
    swarmStatusLabel: 'Building',
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

  const builderUser = `${converted.instruction}${historyNote}${
    researchBlock ? `\n\n${researchBlock}` : ''
  }\n\nOriginal user request:\n${opts.prompt}`;

  const result = await callWithFallback(
    route.builder,
    [
      { role: 'system', content: BUILDER_SYSTEM },
      { role: 'user', content: builderUser },
    ],
    { maxTokens: 16384, temperature: 0.45 },
  );

  usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);

  // Stream text to UI in chunks for perceived progress
  const text = result.text;
  const chunkSize = 120;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (opts.signal?.aborted) break;
    opts.onDelta?.(text.slice(i, i + chunkSize));
  }

  const site = extractSiteFiles(text);
  const projectName = projectNameFromPrompt(opts.prompt);

  emit({
    agent: 'builder',
    status: 'complete',
    message: site ? 'Site ready' : 'Response ready',
    swarmStatusLabel: 'Done',
    swarmActivity: site ? 'Preview ready' : 'Answer ready',
    swarmTodos: todosForBuild('done').map((t) => ({ ...t, status: 'done' as const })),
  });

  if (site && siteLooksComplete(site)) {
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
        message: `Built **${projectName}** with ${MODELS[result.modelId].label}.`,
        modelLabel: MODELS[result.modelId].label,
        fileTrail: [
          { path: 'index.html', status: 'created' },
          ...(site.css ? [{ path: 'styles.css', status: 'created' }] : []),
          ...(site.js ? [{ path: 'script.js', status: 'created' }] : []),
        ],
      },
      tokenUsage: usageToTokenUsage(usage),
      followUps: [
        'Push this to GitHub',
        'Deploy to Vercel',
        'Refine the design',
        'Add another feature',
      ],
      route,
    };
  }

  // Chat / research / analysis style output
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
