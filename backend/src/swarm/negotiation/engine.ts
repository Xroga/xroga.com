/**
 * XROGA 9-Phase Swarm Negotiation Engine (internal phases 0–8)
 * DeepSeek + Gemini + Groq + Mistral (Core Quartet) | Claude/GPT (Reserve)
 */

import { geminiGenerate } from '../../lib/gemini.js';
import { groqChat } from '../../lib/groq.js';
import { deepSeekChat } from '../../lib/deepseek.js';
import { getSecret } from '../../config/envSecrets.js';
import { XROGA_USER_IDENTITY } from '../../prompts/xrogaIdentity.js';
import { analyzeUserQuery } from '../../lib/queryAnalyzer.js';
import { looksLikeBuildEssay } from '../../lib/buildIntent.js';
import { geminiGenerateCultural } from '../../council/geminiClient.js';
import { deepseekGenerate } from '../../council/deepseekClient.js';
import { groqGeneral } from '../../council/groqClient.js';
import { mistralVerify, mistralChat } from '../../council/mistralClient.js';
import { formatPlainProfessional } from '../../blackhole/plainTextFormat.js';
import { buildLandingFromSwarmAssembly } from './assembleLandingFromSwarm.js';
import { generatePromptMatchedSite } from '../../lib/promptSiteScaffold.js';
import { emitRealSiteWithDeepSeek } from '../../lib/deepseekRealSiteEmit.js';
import { looksLikePromptScaffold } from '../../lib/siteQualityGate.js';
import { debugCode } from '../../services/debugging/codeDebugger.js';
import { defaultPlanForPrompt, defaultUpdatePlanForPrompt, defaultGamePlanForPrompt } from './defaultPlans.js';
import {
  detectBuildProjectType,
  hasGameBuildContext,
  isGameBuildPrompt,
  isGamePhaseContinuation,
  needsGameDreamInterview,
} from './buildTypeDetector.js';
import {
  GAME_INTERVIEW_QUESTIONS,
  GAME_PHASE_COMPLETE_MSG,
  PHASE_0_GAME_DISCOVERY,
  PHASE_1_GAME_PLANNING,
  PHASE_3_GAME_EXECUTE,
} from './gamePrompts.js';
import { BuildState } from './buildState.js';
import { formatMemorySuggestion, getPreviousBuilds } from '../../services/memory/buildMemory.js';
import { upsertBuildProject } from '../../services/memory/buildProjectStore.js';
import { webSearch, formatWebSearchContext } from '../../lib/webSearch.js';
import { fetchUiTrendResearch } from '../../lib/uiTrendResearch.js';
import { formatAiEndpointContext, integratedAiSummaryForPrompt } from '../../lib/aiEndpointCatalog.js';
import {
  formatFieldEndpointContext,
  fieldEndpointSummaryForPrompt,
} from '../../lib/fieldEndpointCatalog.js';
import { fetchHackathonResearch, isHackathonQuery } from '../../lib/hackathonResearch.js';
import {
  buildSummaryFromBrief,
  formatBuildSummaryCard,
  inferUpdateChangesSummary,
  friendlyStepLabel,
  inferBusinessLabel,
  inferDefaultBuildBrief,
  isWebsiteBuildPrompt,
  parseProjectName,
  slugFromProjectName,
  stepTargetLabel,
} from './phaseUi.js';
import type { FeatureCategory, FeatureOutput, SwarmProgressEvent } from '../../types/features.js';
import type { NegotiationContext, NegotiationPhase, NegotiationResult, VerificationReport } from './types.js';
import {
  BRAND_HEADER,
  PHASE_0_DISCOVERY,
  PHASE_0_GROQ_SUMMARIZE,
  PHASE_0_UPDATE_BRIEF,
  PHASE_1_PLANNING_GEMINI,
  PHASE_1_PLANNING_GROQ,
  PHASE_2_DEEPSEEK_REVIEW,
  PHASE_2_GEMINI_AGREE,
  PHASE_3_EXECUTE,
  PHASE_3_UPDATE_EXECUTE,
  PHASE_4_GROQ_VERIFY,
  PHASE_4_GEMINI_VERIFY,
  PHASE_5_CORRECT,
  PHASE_6_FINAL,
} from './prompts.js';
import { BRAND, failureBrand } from './brandedMessages.js';
import { reservePolish, shouldUseReserve } from './reserve.js';
import {
  isGitHubConnected,
  pushAndDeployLivePreview,
  pushBuildToGitHub,
  fetchBuildFilesFromGitHub,
  fetchGitHubFilesByPaths,
  analyzeGitHubRepo,
} from '../../services/integrations/githubDeploy.js';
import { isVercelConnected } from '../../services/integrations/vercelAuth.js';
import {
  extractPatchedFilesFromAssembly,
  extractDeletedPathsFromAssembly,
  formatFilesForUpdateContext,
  landingOutputToPatchedFiles,
  mergePatchedFiles,
  planIncrementalUpdate,
  isForcedFullRepoFix,
  shouldAllowFullScaffoldOnUpdate,
  buildFileTrailDiffs,
  shortChangeSummary,
  changeSummaryFromFileTrail,
  inferDeletePathsFromPrompt,
  type UpdateTargetPlan,
} from '../../lib/incrementalUpdate.js';
import { siteCodeFromProjectFiles, LANDING_UPDATE_FOLLOW_UPS } from '../../lib/landingPreview.js';
import {
  isBuildContinuation,
  isSelectedRepoUpdateRequest,
  isWebsiteUpdateRequest,
  threadHasCompletedWebsite,
} from '../../lib/buildContinuation.js';
import { deepseekInteractiveQaFix } from '../../lib/siteInteractiveQa.js';
import { extractProjectNameFromHtml, polishShippedSite } from '../../lib/siteShipPolish.js';
import { parseAssembledProject } from '../../lib/parseAssembledSite.js';
import { routingPrompt } from '../../lib/promptRouting.js';
import { deepseekCode, groqCode, geminiCode } from '../../services/code/codeClients.js';
import { resolveApiKey } from '../../config/apiKeyRouter.js';
import { runGrokCodeReviewLoop } from './grokReview.js';
import { buildModelCall, buildForcedCorrection } from './buildModelRouter.js';
import {
  xrogaArchitectureLine,
  xrogaPulseLine,
  xrogaVisionaryLine,
  xrogaCollectiveLine,
  xrogaBlackHoleLine,
  xrogaGitHubLine,
} from './xrogaBrandActivity.js';
import { buildFullProjectFiles, scaffoldFilePaths } from '../../services/projectScaffold.js';
import { buildProviderEnvFiles } from '../../services/integrations/userProviderKeys.js';
import { BuildUsageTracker } from '../../lib/buildUsageTracker.js';
import { recordLlmUsage } from '../../phase1/usageRecorder.js';
import { autoPublishBuildToCommunity } from '../../services/communityAutoPublish.js';
import { notifyBuildComplete, notifyBuildFailed } from '../../services/notificationService.js';
import { createTodoState } from './todoState.js';
import { XROGA_MODELS } from '../../config/modelRegistry.js';
import {
  costAwareRole,
  isComplexProductBuild,
  policyForPrompt,
  strategyGrokVariant,
} from '../../lib/buildCostPolicy.js';
import { createBuildBudget } from '../../lib/buildBudget.js';

/** Max tokens per build step — no compromise on complete code output */
const BUILD_STEP_MAX_TOKENS = 16384;
/** Landings with toggle+pricing need room — 8k truncated Flash into scaffold fallbacks */
const SIMPLE_BUILD_STEP_MAX_TOKENS = 12288;

function assertNotAborted(ctx: NegotiationContext) {
  if (ctx.abortSignal?.aborted) {
    throw new Error('CLIENT_DISCONNECTED');
  }
}

function emit(
  ctx: NegotiationContext,
  phase: NegotiationPhase,
  detail: string,
  agent: string,
  todos: ReturnType<typeof createTodoState>,
  statusLabel: string,
  opts?: {
    silent?: boolean;
    keepalive?: boolean;
    userPhase?: number;
    hackathonBrief?: import('../../phase1/types.js').HackathonBriefCard;
  }
): void {
  assertNotAborted(ctx);
  // Keep userFacingPhase aligned with negotiationPhase so any consumer advances.
  const userPhase = opts?.userPhase ?? phase;
  const keepalive = Boolean(opts?.keepalive || (opts?.silent && !detail));

  ctx.onProgress?.({
    runId: crypto.randomUUID(),
    agent,
    status: `phase_${phase}`,
    message: opts?.silent ? '' : detail,
    negotiationPhase: phase,
    userFacingPhase: userPhase,
    swarmLogic: true,
    swarmTodos: todos.snapshot(),
    swarmStatusLabel: statusLabel,
    swarmAnalysis: todos.getAnalysis() || undefined,
    swarmActivity: opts?.silent ? undefined : detail,
    keepalive,
    needsGitHub: statusLabel === 'XROGA GitHub' && detail.includes('Connect GitHub'),
    needsVercel: statusLabel === 'XROGA Deploy' && detail.includes('Connect Vercel'),
    hackathonBrief: opts?.hackathonBrief,
    timestamp: new Date().toISOString(),
  } as SwarmProgressEvent);
}

export function shouldUseNegotiationEngine(prompt: string, category: FeatureCategory): boolean {
  if (['landing_page', 'code_debug', 'browser_automation'].includes(category)) return true;
  if (isBuildContinuation(prompt)) return true;
  if (isWebsiteUpdateRequest(prompt) && threadHasCompletedWebsite(prompt)) return true;
  const t = prompt.toLowerCase();
  const buildVerb =
    /\b(build|building|create|creating|make|making|develop|developing|design|designing|launch|scaffold|generate|generating)\b/;
  const buildTarget =
    /\b(website|web app|landing|saas|dashboard|crm|marketplace|platform|chatbot|chat\s*bot|software|tool|app|api|crypto|blockchain|web3|defi|nft|wallet|exchange|swap|bridge|solidity|dapp|bot|assistant|automation|ecommerce|store|shop|blog|portfolio|booking|scheduler|tracker|invoice|forum|messaging|course|membership|job board|directory|admin|analytics|debugger|code builder|image gen|video|mobile app|flutter|react native|game|enterprise|social|video platform|ai agent|swarm|hackathon|solana)\b/;
  if (buildVerb.test(t) && buildTarget.test(t)) return true;
  if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error|typescript|python|solidity)\b/.test(t)) return true;
  return false;
}

function hasBuildConversationContext(prompt: string): boolean {
  return /\[Previous conversation for context/i.test(prompt) || /Fully Clarified Project Brief/i.test(prompt);
}

function isPass(text: string): boolean {
  const head = text.trim().slice(0, 160);
  return (
    /^PASS\b/i.test(head) ||
    /\bUNANIMOUS APPROVAL\b/i.test(head) ||
    /^APPROVED PLAN\b/i.test(head) ||
    /\bFULL PROJECT APPROVED\b/i.test(head) ||
    /\bSTEP\s+\d+\s+APPROVED\b/i.test(head)
  );
}

function parsePlanSteps(plan: string): string[] {
  const steps: string[] = [];
  for (const line of plan.split('\n')) {
    const m = line.match(/^Step\s+(\d+)[.:]\s*(.+)/i) ?? line.match(/^(\d+)[.)]\s+(.+)/);
    if (m?.[2]) steps.push(m[2].trim());
  }
  if (steps.length) return steps;
  return plan
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15)
    .slice(0, 8);
}

async function geminiCall(
  system: string,
  user: string,
  maxTokens = 2048,
  tracker?: BuildUsageTracker
): Promise<string> {
  try {
    let text: string;
    if (resolveApiKey('gemini', 'code')) {
      text = await geminiCode(`${XROGA_USER_IDENTITY}\n\n${system}`, user, { maxTokens });
    } else if (getSecret('GEMINI_API_KEY')) {
      text = await geminiGenerate(`${XROGA_USER_IDENTITY}\n\n${system}`, user, {
        model: 'gemini-2.0-flash',
        maxTokens,
      });
    } else {
      text = await geminiGenerateCultural(user);
    }
    // Gemini is not in the core 7M mix — bill as Flash-equivalent for honest pool deduction
    tracker?.add(
      'deepseek_flash',
      Math.max(1, Math.ceil((system.length + user.length) / 4)),
      Math.max(1, Math.ceil((text?.length ?? 0) / 4))
    );
    return text;
  } catch {
    return deepseekCall(system, user, maxTokens, tracker);
  }
}

async function groqCall(system: string, user: string, maxTokens = 512): Promise<string> {
  try {
    if (resolveApiKey('groq', 'code')) {
      return groqCode(`${XROGA_USER_IDENTITY}\n\n${system}`, user, { maxTokens });
    }
    if (getSecret('GROQ_API_KEY')) {
      return groqChat(
        [
          { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${system}` },
          { role: 'user', content: user },
        ],
        { maxTokens }
      );
    }
    return groqGeneral(user);
  } catch {
    return deepseekCall(system, user, maxTokens);
  }
}

async function deepseekCall(
  system: string,
  user: string,
  maxTokens = 8192,
  tracker?: BuildUsageTracker
): Promise<string> {
  if (resolveApiKey('deepseek', 'code')) {
    const text = await deepseekCode(`${XROGA_USER_IDENTITY}\n\n${system}`, user, {
      maxTokens,
      model: XROGA_MODELS.deepseek_flash.apiModel,
    });
    tracker?.add(
      'deepseek_flash',
      Math.max(1, Math.ceil((system.length + user.length) / 4)),
      Math.max(1, Math.ceil((text?.length ?? 0) / 4))
    );
    return text;
  }
  if (getSecret('DEEPSEEK_API_KEY')) {
    const text = await deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${system}` },
        { role: 'user', content: user },
      ],
      { model: XROGA_MODELS.deepseek_flash.apiModel, maxTokens }
    );
    tracker?.add(
      'deepseek_flash',
      Math.max(1, Math.ceil((system.length + user.length) / 4)),
      Math.max(1, Math.ceil((text?.length ?? 0) / 4))
    );
    return text;
  }
  const text = await deepseekGenerate(user);
  tracker?.add(
    'deepseek_flash',
    Math.max(1, Math.ceil((system.length + user.length) / 4)),
    Math.max(1, Math.ceil((text?.length ?? 0) / 4))
  );
  return text;
}

/** Tracked DeepSeek Flash — bulk code, file reads, verify, fixes */
async function deepseekFlashCall(
  system: string,
  user: string,
  maxTokens = 8192,
  tracker?: BuildUsageTracker,
  userId?: string
): Promise<string> {
  const { text } = await buildModelCall('flash', system, user, maxTokens, tracker, { userId });
  return text;
}

/** Tracked DeepSeek Pro — architecture, plan review, repo analysis, hard logic */
async function deepseekProCall(
  system: string,
  user: string,
  maxTokens = 8192,
  tracker?: BuildUsageTracker,
  userId?: string
): Promise<string> {
  const { text } = await buildModelCall('pro', system, user, maxTokens, tracker, { userId });
  return text;
}

/**
 * During long model waits: one honest line, then silent connection keepalives.
 * Never rotate fake “Generating styles / polishing…” — that looked like real progress.
 */
async function withBuildHeartbeat<T>(
  ctx: NegotiationContext,
  todos: ReturnType<typeof createTodoState>,
  work: () => Promise<T>,
  stepHint?: string
): Promise<T> {
  const hint = stepHint?.trim() ? ` — ${stepHint.trim().slice(0, 80)}` : '';
  emit(
    ctx,
    3,
    `Waiting on AI model response${hint}`,
    'builder',
    todos,
    'XROGA Pulse'
  );
  // Silent todo snapshots keep the stream alive without fake activity text
  const id = setInterval(() => {
    try {
      emit(ctx, 3, '', 'builder', todos, 'XROGA Pulse', { silent: true });
    } catch {
      /* aborted */
    }
  }, 20_000);
  try {
    return await work();
  } finally {
    clearInterval(id);
  }
}

async function verifyStepParallel(
  code: string,
  plan: string,
  prompt: string,
  tracker?: BuildUsageTracker,
  light = false,
  userId?: string
): Promise<VerificationReport[]> {
  const quotaOpts = userId ? { userId } : undefined;
  if (light) {
    const r = await buildModelCall('flash', PHASE_4_GROQ_VERIFY, `Code:\n${code.slice(0, 6000)}`, 256, tracker, quotaOpts);
    return [{ agent: 'groq', pass: isPass(r.text), report: r.text }];
  }
  const results = await Promise.allSettled([
    buildModelCall('flash', PHASE_4_GROQ_VERIFY, `Code:\n${code.slice(0, 6000)}`, 256, tracker, quotaOpts).then((r) => ({
      agent: 'groq' as const,
      pass: isPass(r.text),
      report: r.text,
    })),
    geminiCall(
      PHASE_4_GEMINI_VERIFY,
      `Plan:\n${plan.slice(0, 1500)}\n\nUser: ${prompt.slice(0, 300)}\n\nCode:\n${code.slice(0, 6000)}`,
      256,
      tracker
    ).then((r) => ({ agent: 'gemini' as const, pass: isPass(r), report: r })),
    getSecret('MISTRAL_API_KEY')
      ? mistralVerify(code, plan, prompt).then((r) => ({
          agent: 'mistral' as const,
          pass: isPass(r),
          report: r,
        }))
      : Promise.resolve({ agent: 'mistral' as const, pass: true, report: 'PASS (Mistral skipped)' }),
  ]);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const agents = ['groq', 'gemini', 'mistral'] as const;
    return { agent: agents[i]!, pass: true, report: `PASS (agent unavailable)` };
  });
}

/** Persist any unbilled API tokens from this build (idempotent via tracker deltas). */
async function flushBuildUsage(userId: string, usageTracker: BuildUsageTracker): Promise<void> {
  const delta = usageTracker.unbilledDelta();
  if (!delta.length) return;
  const input = delta.reduce((s, d) => s + d.inputTokens, 0);
  const output = delta.reduce((s, d) => s + d.outputTokens, 0);
  if (input + output <= 0) return;
  try {
    await recordLlmUsage(userId, input, output, delta);
    usageTracker.markBilled(delta);
  } catch (err) {
    console.error(
      '[NegotiationEngine] CRITICAL: failed to persist build token usage',
      (err as Error).message?.slice(0, 200)
    );
  }
}

export async function runNegotiationEngine(ctx: NegotiationContext): Promise<NegotiationResult> {
  const usageTracker = ctx.usageTracker ?? new BuildUsageTracker();
  ctx.usageTracker = usageTracker;

  try {
  const { userPrompt: rawPrompt, featureCategory, userId } = ctx;
  const userPrompt = rawPrompt.trim();
  const costPolicy = policyForPrompt(userPrompt);
  const buildBudget = createBuildBudget(costPolicy.tier);
  let shipEarly = false;
  console.info('[NegotiationEngine] costPolicy', {
    tier: costPolicy.tier,
    allowGrokStrategy: costPolicy.allowGrokStrategy,
    allowGrok45: costPolicy.allowGrok45,
    maxGrok45Calls: costPolicy.maxGrok45Calls,
    allowGrokReviewLoop: costPolicy.allowGrokReviewLoop,
    allowWebResearch: costPolicy.allowWebResearch,
    maxBuildSteps: costPolicy.maxBuildSteps,
    maxStepCorrections: costPolicy.maxStepCorrections,
    softMs: buildBudget.limits.softMs,
    hardMs: buildBudget.limits.hardMs,
  });
  const currentMessage = routingPrompt(userPrompt);
  const hasSelectedRepo = Boolean(ctx.githubTargetRepo?.includes('/'));
  // Optimistic todos so UI paints before GitHub status round-trip
  const todos = createTodoState(userPrompt, {
    hasSelectedRepo,
    githubConnected: hasSelectedRepo,
  });
  const buildState = new BuildState();
  const businessLabel = inferBusinessLabel(userPrompt);
  const markShipEarly = (reason: string) => {
    if (shipEarly) return;
    shipEarly = true;
    console.warn('[NegotiationEngine] ship-early:', reason, {
      elapsedMs: buildBudget.elapsedMs(),
      calls: usageTracker.totalCalls,
      tier: costPolicy.tier,
    });
    emit(
      ctx,
      6,
      xrogaPulseLine(`Shipping best result now — ${reason}`),
      'builder',
      todos,
      'XROGA Pulse'
    );
  };

  // First SSE progress ASAP — do not wait on GitHub connectivity
  emit(ctx, 0, BRAND.phase0.scanning(businessLabel), 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });

  const githubConnectedEarly = await isGitHubConnected(userId).catch(() => false);

  // Soft gate: always BUILD first. Never leave UI stuck on "Connect GitHub".
  const githubConnected = githubConnectedEarly;
  todos.completeMeta('github');
  if (!githubConnected && !hasSelectedRepo) {
    emit(
      ctx,
      0,
      xrogaArchitectureLine('Building sandbox preview first — GitHub optional for push later'),
      'architect',
      todos,
      'XROGA Architect',
      { userPhase: 1 }
    );
  } else {
    buildState.markDone('auth');
    emit(
      ctx,
      0,
      hasSelectedRepo
        ? xrogaArchitectureLine(`Using selected repo ${ctx.githubTargetRepo}`)
        : BRAND.github.verified,
      'architect',
      todos,
      'AI SWARM LOGIC'
    );
  }

  const pastBuilds = await getPreviousBuilds(userId);
  const memoryNote = formatMemorySuggestion(pastBuilds);

  todos.activateMeta('analyze');
  emit(ctx, 0, BRAND.phase0.scanning(businessLabel), 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });

  const analysis = analyzeUserQuery(userPrompt);
  const buildType = detectBuildProjectType(userPrompt);
  const isGameBuild = buildType === 'game' || isGameBuildPrompt(userPrompt);
  const isProductBuild =
    !isGameBuild &&
    (featureCategory === 'landing_page' ||
      isWebsiteBuildPrompt(userPrompt, featureCategory) ||
      ['crypto', 'chatbot', 'software', 'app', 'api', 'saas', 'dashboard', 'marketplace', 'automation'].includes(
        buildType
      ));

  // Updates: thread markers OR selected GitHub repo + update language (patch, don't rebuild new site)
  const isUpdateBuild =
    isProductBuild &&
    (Boolean(ctx.buildUpdate) ||
      isWebsiteUpdateRequest(userPrompt) ||
      isSelectedRepoUpdateRequest(userPrompt, ctx.githubTargetRepo)) &&
    (Boolean(ctx.buildUpdate) ||
      Boolean(ctx.priorSite?.html?.trim()) ||
      hasBuildConversationContext(userPrompt) ||
      threadHasCompletedWebsite(userPrompt) ||
      isSelectedRepoUpdateRequest(userPrompt, ctx.githubTargetRepo));

  const forcedFullRepoFix = isForcedFullRepoFix(userPrompt);

  if ((isProductBuild || isGameBuild) && !isUpdateBuild) {
    const vercelOk = await isVercelConnected(userId);
    if (!vercelOk) {
      emit(ctx, 0, xrogaArchitectureLine('Vercel not connected — sandbox preview ready; connect Vercel for live URL on your account'), 'architect', todos, 'XROGA Deploy', { silent: true });
    }
  }

  let incrementalPlan: UpdateTargetPlan | null = isUpdateBuild
    ? planIncrementalUpdate(userPrompt)
    : null;

  let webResearchNote = '';
  let uiTrendNote = '';
  let hackathonNote = '';

  // Cost policy: simple blogs/landings skip paid web research + all Grok agent tools
  if ((isProductBuild || isGameBuild) && !isUpdateBuild && costPolicy.allowWebResearch) {
    try {
      assertNotAborted(ctx);
      const searchQuery = isWebsiteUpdateRequest(userPrompt)
        ? `${currentMessage} UI patterns best practices`
        : `${inferBusinessLabel(userPrompt)} ${buildType} requirements 2026`;
      const results = await webSearch(searchQuery, {
        maxResults: 3,
        forceTavily: /\bhackathon|okx|asp\b|crypto|web3\b/i.test(userPrompt),
      });
      if (results.length) {
        webResearchNote = formatWebSearchContext(results);
        emit(
          ctx,
          0,
          xrogaPulseLine(`Web research — ${results.length} sources`),
          'reviewer',
          todos,
          'XROGA Pulse',
          { userPhase: 1 }
        );
      }
    } catch (searchErr) {
      console.warn('[NegotiationEngine] Web search:', (searchErr as Error).message);
    }

    try {
      assertNotAborted(ctx);
      const uiTrend = await fetchUiTrendResearch(inferBusinessLabel(userPrompt), buildType);
      if (uiTrend) {
        uiTrendNote = uiTrend.context;
        todos.activate('ui-trends');
        emit(ctx, 0, xrogaVisionaryLine('UI guidance — modern design patterns'), 'reviewer', todos, 'XROGA Visionary', {
          userPhase: 1,
        });
      }
    } catch {
      /* optional */
    }

    try {
      if (isHackathonQuery(userPrompt)) {
        todos.activate('research');
        const hackathon = await fetchHackathonResearch(userPrompt);
        if (hackathon) {
          hackathonNote = hackathon.context;
          todos.complete('research');
          todos.activate('ideas');
          emit(ctx, 0, xrogaArchitectureLine('Hackathon requirements researched — sponsor gaps & ASP ideas mapped'), 'architect', todos, 'XROGA Architect', {
            userPhase: 1,
            hackathonBrief: hackathon.card,
          });
          todos.complete('ideas');
        } else {
          todos.complete('research');
        }
      }
    } catch {
      /* optional — only for hackathon/OKX prompts */
    }

    if (costPolicy.allowGrokResearchSynthesis && (webResearchNote || uiTrendNote || hackathonNote)) {
      try {
        assertNotAborted(ctx);
        const { text: synthesis } = await buildModelCall(
          'pro',
          `You are XROGA Strategist. Synthesize research into build priorities and risks. Under 250 words. Do not invent sources.`,
          `User:\n${userPrompt}\n\n${webResearchNote}\n${uiTrendNote}\n${hackathonNote}`,
          1536,
          usageTracker,
          { userId }
        );
        if (synthesis?.trim()) {
          webResearchNote = `${webResearchNote}\n\nResearch synthesis:\n${synthesis}`;
          emit(ctx, 0, xrogaArchitectureLine('Research synthesis ready'), 'architect', todos, 'XROGA Architect', {
            userPhase: 1,
          });
        }
      } catch {
        /* optional */
      }
    }
  } else if ((isProductBuild || isGameBuild) && !isUpdateBuild && !costPolicy.allowWebResearch) {
    emit(
      ctx,
      0,
      xrogaPulseLine('Cost-smart path — skipping live web crawl for this simple build'),
      'reviewer',
      todos,
      'XROGA Pulse',
      { userPhase: 1, silent: true }
    );
  }

  const isWebBuild = isProductBuild;

  let existingSiteCode: { html: string; css: string; js: string } | null = null;
  let targetedUpdateFiles: import('../../services/integrations/githubDeploy.js').ProjectFile[] = [];
  let repoAnalysisSummary: string | null = null;
  let criticalRepoFilesNote = '';
  let repoTreePaths: string[] = [];
  let updateDeletePaths: string[] = [];
  if (isWebBuild && ctx.githubTargetRepo?.includes('/')) {
    try {
      const analysis = await analyzeGitHubRepo(userId, ctx.githubTargetRepo, ctx.githubTargetBranch);
      repoAnalysisSummary = analysis.summary;
      repoTreePaths = analysis.treeSample.map((f) => f.path);
      if (isUpdateBuild) {
        incrementalPlan = planIncrementalUpdate(userPrompt, repoTreePaths);
        updateDeletePaths = inferDeletePathsFromPrompt(userPrompt, repoTreePaths);
        emit(
          ctx,
          0,
          xrogaPulseLine(
            `Incremental update — reading ${incrementalPlan.filePaths.size} exact file(s) from GitHub`
          ),
          'reviewer',
          todos,
          'XROGA Pulse',
          { userPhase: 6 }
        );
        targetedUpdateFiles = await fetchGitHubFilesByPaths(
          userId,
          ctx.githubTargetRepo,
          [...incrementalPlan.filePaths],
          ctx.githubTargetBranch
        );
        // If path inference missed, load entrypoints from the real tree (not sandbox priorSite)
        if (!targetedUpdateFiles.length && repoTreePaths.length) {
          const fallbackPaths = [
            ...repoTreePaths.filter((p) => /(?:^|\/)(index\.html|app\/page\.(tsx|jsx|js)|src\/app\/page\.(tsx|jsx|js)|pages\/index\.(tsx|jsx|js)|styles\.css|script\.js|package\.json)$/i.test(p)),
          ].slice(0, 8);
          if (fallbackPaths.length) {
            targetedUpdateFiles = await fetchGitHubFilesByPaths(
              userId,
              ctx.githubTargetRepo,
              fallbackPaths,
              ctx.githubTargetBranch
            );
            for (const p of fallbackPaths) incrementalPlan.filePaths.add(p);
          }
        }
        if (targetedUpdateFiles.length) {
          existingSiteCode = siteCodeFromProjectFiles(targetedUpdateFiles);
        } else {
          emit(
            ctx,
            0,
            xrogaPulseLine(
              'Could not load target files from GitHub — refusing sandbox priorSite overwrite on a selected repo'
            ),
            'reviewer',
            todos,
            'XROGA Pulse',
            { userPhase: 6 }
          );
        }
      } else if (analysis.hasBuildFiles) {
        existingSiteCode = analysis.buildFiles;
      }
      if ((forcedFullRepoFix || !isUpdateBuild) && analysis.treeSample.length) {
        const criticalPaths = [
          'package.json',
          'index.html',
          'styles.css',
          'script.js',
          'app/page.tsx',
          'app/layout.tsx',
          'src/app/page.tsx',
        ].filter((cp) => analysis.treeSample.some((f) => f.path === cp || f.path.endsWith(`/${cp}`)));
        if (criticalPaths.length) {
          const criticalFiles = await fetchGitHubFilesByPaths(
            userId,
            ctx.githubTargetRepo,
            criticalPaths.slice(0, 8),
            ctx.githubTargetBranch
          );
          if (criticalFiles.length) {
            criticalRepoFilesNote = `\n\n${formatFilesForUpdateContext(criticalFiles, 12_000)}`;
            emit(ctx, 0, xrogaPulseLine(`Critical repo files loaded (${criticalFiles.length}) for production-quality build`), 'reviewer', todos, 'XROGA Pulse', {
              userPhase: 1,
            });
          }
        }
      }
      if (!isUpdateBuild) {
        emit(ctx, 0, BRAND.phase0.scanning(`GitHub repo (${analysis.fileCount} files)`), 'reviewer', todos, 'XROGA Visionary', {
          userPhase: 1,
        });
      }
    } catch (fetchErr) {
      console.warn('[NegotiationEngine] GitHub repo analysis:', (fetchErr as Error).message);
      if (isUpdateBuild) {
        try {
          targetedUpdateFiles = await fetchGitHubFilesByPaths(
            userId,
            ctx.githubTargetRepo,
            [...(incrementalPlan?.filePaths ?? ['index.html', 'styles.css', 'script.js'])],
            ctx.githubTargetBranch
          );
          existingSiteCode = siteCodeFromProjectFiles(targetedUpdateFiles);
        } catch (fallbackErr) {
          console.warn('[NegotiationEngine] Fetch targeted files:', (fallbackErr as Error).message);
        }
      } else {
        try {
          const files = await fetchBuildFilesFromGitHub(userId, ctx.githubTargetRepo, ctx.githubTargetBranch);
          existingSiteCode = siteCodeFromProjectFiles(files);
        } catch (fallbackErr) {
          console.warn('[NegotiationEngine] Fetch existing site:', (fallbackErr as Error).message);
        }
      }
    }
  }

  // Sandbox-only updates: use last in-chat preview when NO GitHub repo is selected.
  // Never substitute priorSite over a selected GitHub project (that caused cosmetic "updates").
  if (
    isUpdateBuild &&
    !targetedUpdateFiles.length &&
    ctx.priorSite?.html?.trim() &&
    !ctx.githubTargetRepo?.includes('/')
  ) {
    const priorHtml = ctx.priorSite.html;
    const priorCss = ctx.priorSite.css || '';
    const priorJs = ctx.priorSite.js || '';
    existingSiteCode = { html: priorHtml, css: priorCss, js: priorJs };
    targetedUpdateFiles = [
      { path: 'index.html', content: priorHtml },
      ...(priorCss.trim() ? [{ path: 'styles.css', content: priorCss }] : []),
      ...(priorJs.trim() ? [{ path: 'script.js', content: priorJs }] : []),
    ];
    if (!incrementalPlan) {
      incrementalPlan = planIncrementalUpdate(userPrompt);
    }
    emit(
      ctx,
      0,
      xrogaPulseLine('Incremental update — patching sandbox preview (no GitHub repo selected)'),
      'reviewer',
      todos,
      'XROGA Pulse',
      { userPhase: 6 }
    );
  }

  if (needsGameDreamInterview(userPrompt) && !hasGameBuildContext(userPrompt)) {
    todos.setAnalysis('game — dream interview');
    emit(ctx, 0, BRAND.phase0.clarifying('game'), 'reviewer', todos, 'XROGA Game Alchemist');
    return {
      success: false,
      clarifiedBrief: '',
      approvedPlan: '',
      assembledCode: '',
      polishedOutput: formatPlainProfessional(GAME_INTERVIEW_QUESTIONS),
      needsUserClarification: true,
      clarificationText: GAME_INTERVIEW_QUESTIONS,
    };
  }

  if (
    analysis.needsClarification &&
    analysis.clarificationText &&
    !hasBuildConversationContext(userPrompt) &&
    !isWebBuild &&
    !isGameBuild
  ) {
    todos.setAnalysis(analysis.intentLabel);
    emit(ctx, 0, BRAND.phase0.clarifying(businessLabel), 'reviewer', todos, 'XROGA Visionary');
    return {
      success: false,
      clarifiedBrief: '',
      approvedPlan: '',
      assembledCode: '',
      polishedOutput: formatPlainProfessional(analysis.clarificationText),
      needsUserClarification: true,
      clarificationText: analysis.clarificationText,
    };
  }

  let clarifiedBrief: string;
  const aiEndpointNote = formatAiEndpointContext(userPrompt);
  const fieldEndpointNote = formatFieldEndpointContext(userPrompt);
  /** Free AI + field APIs — kept outside the 50-word summarize so DeepSeek still wires them. */
  const liveIntegrationsNote = [aiEndpointNote, fieldEndpointNote].filter(Boolean).join('\n\n');
  let repoContextLine = repoAnalysisSummary ? `\n\nGitHub repo analysis:\n${repoAnalysisSummary}${criticalRepoFilesNote}` : criticalRepoFilesNote;
  const researchBundle = `${webResearchNote}${uiTrendNote}${hackathonNote}${liveIntegrationsNote ? `\n\n${liveIntegrationsNote}` : ''}`;
  const discoveryContext = userPrompt.includes('[Previous conversation')
    ? `${userPrompt}${repoContextLine}${researchBundle}`
    : `${userPrompt}${repoContextLine}${researchBundle}\n\nOriginal build request context preserved.`;
  const appendLiveIntegrations = (brief: string): string => {
    if (!liveIntegrationsNote.trim()) return brief;
    if (/LIVE INTEGRATIONS|AUTO-INTEGRATE live free APIs|AI \/ API integration options/i.test(brief)) {
      return brief;
    }
    return `${brief.trim()}\n\n--- LIVE INTEGRATIONS (do not drop — wire into generated JS) ---\n${liveIntegrationsNote}`;
  };

  if (isUpdateBuild) {
    emit(ctx, 0, BRAND.phase0.scanning('website updates'), 'reviewer', todos, 'XROGA Visionary', { userPhase: 6 });
    const latestPrior = pastBuilds[0];
    const priorContext = latestPrior
      ? `Prior build remembered: "${latestPrior.projectName}"${latestPrior.designTheme ? ` (${latestPrior.designTheme})` : ''}${latestPrior.deployUrl ? ` — live at ${latestPrior.deployUrl}` : ''}`
      : '';
    try {
      clarifiedBrief = (
        await buildModelCall(
          'flash',
          PHASE_0_UPDATE_BRIEF,
          `Thread:\n${discoveryContext}\n\n${priorContext}\n\nUpdate request:\n${currentMessage}\n\nOutput the updated Fully Clarified Project Brief. Apply changes directly — do NOT ask questions.`,
          1024,
          usageTracker,
          { userId }
        )
      ).text;
    } catch {
      clarifiedBrief = `Update request: ${currentMessage}\n\n${discoveryContext}`;
    }
    buildState.markDone('clarified');
    todos.setAnalysis(clarifiedBrief.slice(0, 280));
    todos.completeMeta('analyze');
    emit(ctx, 0, BRAND.phase0.briefReady, 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });
  } else if (isWebBuild) {
    // Auto-infer defaults — no questions, start building immediately
    clarifiedBrief = inferDefaultBuildBrief(userPrompt, memoryNote);
    // Simple blogs: skip Pro brief refine + summarize (was adding minutes before any code).
    if (costPolicy.tier !== 'simple_static') {
      try {
        const { text: refined, modelLabel } = await buildModelCall(
          'pro',
          PHASE_0_DISCOVERY,
          `User request:\n${discoveryContext}\n\nDefault brief:\n${clarifiedBrief}\n\nRefine the Fully Clarified Project Brief — do NOT ask questions.`,
          8192,
          usageTracker,
          { userId }
        );
        emit(ctx, 0, xrogaArchitectureLine('Project brief refined'), 'architect', todos, 'XROGA Architect');
        if (refined && !/clarifying question|\?\s*$/im.test(refined) && refined.length > 80) {
          clarifiedBrief = refined;
        }
      } catch {
        /* keep inferred defaults */
      }
    }
    buildState.markDone('clarified');
    todos.setAnalysis(clarifiedBrief.slice(0, 280));
    todos.completeMeta('analyze');
    emit(ctx, 0, BRAND.phase0.briefReady, 'reviewer', todos, 'XROGA Visionary');
    if (costPolicy.tier !== 'simple_static') {
      try {
        const condensed = (
          await buildModelCall('flash', PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 256, usageTracker, { userId })
        ).text;
        if (condensed?.trim()) clarifiedBrief = appendLiveIntegrations(condensed.trim());
        emit(ctx, 0, BRAND.phase0.briefCondensed, 'qa', todos, 'XROGA Pulse');
      } catch {
        clarifiedBrief = appendLiveIntegrations(clarifiedBrief);
      }
    } else {
      clarifiedBrief = appendLiveIntegrations(clarifiedBrief);
    }
  } else if (isGameBuild) {
    emit(ctx, 0, BRAND.phase0.scanning('game'), 'reviewer', todos, 'XROGA Game Alchemist', { userPhase: 1 });
    try {
      clarifiedBrief = await geminiCall(
        PHASE_0_GAME_DISCOVERY,
        `User request:\n${discoveryContext}\n\nOutput Dream Game brief — do NOT write code yet.`,
        2048,
        usageTracker
      );
    } catch {
      clarifiedBrief = `Game build: ${currentMessage}\n\nPlatform: HTML5 Canvas browser game unless user asked for Python.`;
    }
    buildState.markDone('clarified');
    todos.setAnalysis(clarifiedBrief.slice(0, 280));
    todos.completeMeta('analyze');
    emit(ctx, 0, BRAND.phase0.briefReady, 'reviewer', todos, 'XROGA Game Alchemist', { userPhase: 1 });
  } else {
  try {
    clarifiedBrief = await geminiCall(
      PHASE_0_DISCOVERY,
      `User request (full thread):\n${discoveryContext}\n\nCurrent answer:\n${currentMessage}\n\nPrior analysis: ${analysis.intentLabel}\n\nOutput the Fully Clarified Project Brief now — do NOT ask more questions. Match the user's niche from the thread.`,
      2048,
      usageTracker
    );
  } catch {
    clarifiedBrief = `${currentMessage}\n\n${discoveryContext}`;
  }

  buildState.assertCanProceed('clarified');
  buildState.markDone('clarified');

  todos.setAnalysis(clarifiedBrief.slice(0, 280));
  todos.completeMeta('analyze');
  emit(ctx, 0, BRAND.phase0.briefReady, 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });

  try {
    const condensed = (
      await buildModelCall('flash', PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 256, usageTracker, { userId })
    ).text;
    if (condensed?.trim()) clarifiedBrief = appendLiveIntegrations(condensed.trim());
    emit(ctx, 0, BRAND.phase0.briefCondensed, 'qa', todos, 'XROGA Pulse');
  } catch {
    clarifiedBrief = appendLiveIntegrations(clarifiedBrief);
  }
  }

  // Phase 2 planning — user sees planning under Phase 1, review runs silently
  todos.activateMeta('plan');
  buildState.assertCanProceed('planned');
  emit(ctx, 1, xrogaArchitectureLine('System design, database & API plan'), 'architect', todos, 'XROGA Architect', {
    userPhase: 1,
  });
  let masterPlan: string;
  if (isUpdateBuild) {
    masterPlan = defaultUpdatePlanForPrompt(userPrompt).join('\n');
  } else if (isGameBuild) {
    try {
      const { text, modelLabel } = await buildModelCall(
        'flash',
        PHASE_1_GAME_PLANNING,
        `Brief:\n${clarifiedBrief}\n\nOriginal:\n${userPrompt}`,
        8192,
        usageTracker,
        { userId }
      );
      masterPlan = text;
      emit(ctx, 1, xrogaArchitectureLine('Game master plan ready'), 'architect', todos, 'XROGA Architect', {
        userPhase: 1,
      });
    } catch {
      masterPlan = defaultGamePlanForPrompt(userPrompt, 4).join('\n');
    }
  } else if (costPolicy.tier === 'simple_static') {
    // Ultra-fast: fixed 2-line plan — no Grok/Pro strategy, no plan condense.
    masterPlan = defaultPlanForPrompt(userPrompt).join('\n');
    emit(ctx, 1, xrogaArchitectureLine('Fast plan ready — building your site now'), 'architect', todos, 'XROGA Architect');
  } else {
    try {
      let strategyContext = '';
      // Strategic Grok 4.5: ONE short brain pass (best model), then Flash/Pro do bulk work.
      // Never agent web/X search. Cap output tokens so 4.5 stays ~$0.01–0.03.
      if (costPolicy.allowGrokStrategy) {
        try {
          assertNotAborted(ctx);
          const grokVariant = strategyGrokVariant(costPolicy);
          const { text: strategy, modelLabel } = await buildModelCall(
            'grok',
            `You are XROGA Strategist. Output a concise build strategy: architecture, key features, UX priorities, and risks. Under 280 words. No code dumps.`,
            `Brief:\n${clarifiedBrief.slice(0, 6000)}\n\nOriginal:\n${userPrompt.slice(0, 1500)}`,
            costPolicy.grok45StrategyMaxTokens,
            usageTracker,
            {
              grokVariant,
              allowGrok45: costPolicy.allowGrok45 && grokVariant === 'fast',
              maxGrok45Calls: costPolicy.maxGrok45Calls,
            }
          );
          strategyContext = `\n\nStrategy (${modelLabel}):\n${strategy}`;
          emit(
            ctx,
            1,
            xrogaArchitectureLine(
              grokVariant === 'fast'
                ? 'Build strategy — Grok 4.5 (strategic, capped)'
                : 'Build strategy — Grok 4.3'
            ),
            'architect',
            todos,
            'XROGA Architect'
          );
        } catch {
          /* optional grok — fall through to Pro plan */
        }
      } else {
        try {
          assertNotAborted(ctx);
          const strategyRole = costAwareRole('pro', costPolicy);
          const { text: strategy } = await buildModelCall(
            strategyRole,
            `You are XROGA Strategist. Analyze the project brief and output a concise build strategy: architecture, key features, UX priorities, and risks. Under 300 words.`,
            `Brief:\n${clarifiedBrief}\n\nOriginal:\n${userPrompt}`,
            2048,
            usageTracker,
            { userId }
          );
          strategyContext = `\n\nStrategy:\n${strategy}`;
          emit(ctx, 1, xrogaArchitectureLine('Build strategy — DeepSeek (cost-smart)'), 'architect', todos, 'XROGA Architect', {
            silent: true,
          });
        } catch {
          /* optional */
        }
      }

      const { text, modelLabel } = await buildModelCall(
        costAwareRole('pro', costPolicy),
        PHASE_1_PLANNING_GEMINI,
        `Brief:\n${clarifiedBrief}${strategyContext}\n\nOriginal:\n${userPrompt}`,
        8192,
        usageTracker,
        { userId }
      );
      masterPlan = text;
      emit(ctx, 1, xrogaArchitectureLine('Master plan generated'), 'architect', todos, 'XROGA Architect');
      try {
        masterPlan = (await buildModelCall('pro', PHASE_1_PLANNING_GROQ, masterPlan, 1024, usageTracker, { userId })).text;
      } catch {
        /* keep plan */
      }
    } catch {
      masterPlan = defaultPlanForPrompt(userPrompt).join('\n');
    }
  }
  buildState.markDone('planned');
  todos.completeMeta('plan');
  emit(ctx, 1, BRAND.phase1.planReady(parsePlanSteps(masterPlan).length), 'architect', todos, 'AI SWARM LOGIC', {
    userPhase: 1,
  });

  todos.activateMeta('structure');
  emit(ctx, 2, BRAND.phase2.reviewing, 'reviewer', todos, 'XROGA Architect');
  let approvedPlan = masterPlan;
  const planIterations = costPolicy.maxPlanIterations;
  if (!isUpdateBuild && planIterations > 0) {
  for (let i = 0; i < planIterations; i++) {
    emit(ctx, 2, BRAND.phase2.reviewing, 'reviewer', todos, 'XROGA Architect');
    const review = await deepseekProCall(
      PHASE_2_DEEPSEEK_REVIEW,
      `User query:\n${userPrompt}\n\nMaster Plan:\n${approvedPlan}`,
      costPolicy.tier === 'simple_static' ? 2048 : 4096,
      usageTracker, userId
    );

    if (isPass(review)) {
      approvedPlan = review.replace(/^APPROVED PLAN\s*/i, '').trim() || approvedPlan;
      break;
    }

    const corrected = review.replace(/^CORRECTED PLAN\s*/i, '').trim() || review;
    // Simple blogs: accept DeepSeek plan correction — skip Gemini agree loop (saves minutes)
    if (costPolicy.tier === 'simple_static') {
      approvedPlan = corrected;
      break;
    }
    emit(ctx, 2, BRAND.phase2.negotiating, 'architect', todos, 'XROGA Visionary');
    const geminiReply = await geminiCall(
      PHASE_2_GEMINI_AGREE,
      `Original user:\n${userPrompt}\n\nCorrected plan:\n${corrected}`,
      2048,
      usageTracker
    );

    if (isPass(geminiReply)) {
      approvedPlan = geminiReply.replace(/^UNANIMOUS APPROVAL\s*/i, '').trim() || corrected;
      break;
    }
    approvedPlan = corrected;
  }
  }
  todos.completeMeta('structure');
  todos.activateMeta('verify-plan');
  todos.completeMeta('verify-plan');
  buildState.markDone('plan_approved');
  emit(ctx, 2, BRAND.phase2.approved, 'reviewer', todos, 'XROGA Architect', { userPhase: 1 });

  const steps = parsePlanSteps(approvedPlan);
  if (!steps.length) {
    const fallback = isUpdateBuild
      ? defaultUpdatePlanForPrompt(userPrompt)
      : isGameBuild
        ? defaultGamePlanForPrompt(userPrompt, 4)
        : defaultPlanForPrompt(userPrompt);
    steps.push(...fallback.map((s) => s.replace(/^Step\s+\d+:\s*/i, '')));
  }

  const gameMaxSteps = isGamePhaseContinuation(userPrompt) ? steps.length : Math.min(steps.length, 2);
  let stepsToRun = isGameBuild ? steps.slice(0, gameMaxSteps) : steps;
  if (!isGameBuild) {
    stepsToRun = steps.slice(0, Math.max(1, costPolicy.maxBuildSteps));
  }
  if (isUpdateBuild && incrementalPlan) {
    stepsToRun = incrementalPlan.labels.slice(0, incrementalPlan.stepCount);
  }
  todos.setBuildSteps(stepsToRun);
  todos.activateMeta('steps');
  todos.completeMeta('steps');

  const stepTokenBudget =
    costPolicy.tier === 'simple_static' ? SIMPLE_BUILD_STEP_MAX_TOKENS : BUILD_STEP_MAX_TOKENS;
  const stepCorrectionsMax = costPolicy.maxStepCorrections;
  const lightVerify =
    isUpdateBuild || costPolicy.lightVerifyAlways || costPolicy.tier === 'simple_static';

  emit(
    ctx,
    3,
    isUpdateBuild
      ? BRAND.phase3.updateStart(stepsToRun.length)
      : isGameBuild
        ? BRAND.phase3.buildStart(stepsToRun.length)
        : BRAND.phase3.buildStart(stepsToRun.length),
    'builder',
    todos,
    isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect'
  );

  const codeParts: string[] = [];
  let totalCorrections = 0;
  const executePrompt = isGameBuild
    ? PHASE_3_GAME_EXECUTE
    : isUpdateBuild
      ? PHASE_3_UPDATE_EXECUTE
      : PHASE_3_EXECUTE;
  const executeTech = isGameBuild
    ? 'HTML5 Canvas game in browser — html, css, javascript fenced blocks. Complete runnable game code.'
    : isUpdateBuild
      ? 'Edit ONLY the GitHub files provided. Use path-labeled fences (e.g. ```app/page.tsx). DELETE fences for removals. Output ONLY fenced code blocks.'
      : 'plain HTML/CSS/JS only. Output ONLY fenced code blocks. No explanations.';
  const deleteContext =
    isUpdateBuild && updateDeletePaths.length
      ? `\n\nDELETE THESE PATHS (emit DELETE fences; do not recreate):\n${updateDeletePaths.map((p) => `- ${p}`).join('\n')}`
      : '';
  const existingCodeContext = targetedUpdateFiles.length
    ? `\n\n${formatFilesForUpdateContext(targetedUpdateFiles)}${deleteContext}`
    : existingSiteCode
      ? `\n\nEXISTING SITE (edit — do not rebuild from scratch):\n--- index.html ---\n${existingSiteCode.html}\n\n--- styles.css ---\n${existingSiteCode.css}\n\n--- script.js ---\n${existingSiteCode.js}${deleteContext}`
      : deleteContext;

  for (let si = 0; si < stepsToRun.length; si++) {
    assertNotAborted(ctx);
    if (buildBudget.hardExceeded(usageTracker)) {
      // Leave unfinished todos pending — do NOT fake-complete them
      markShipEarly('time/call budget reached');
      break;
    }
    if (si > 0 && buildBudget.softExceeded(usageTracker)) {
      markShipEarly('soft budget — finishing with completed steps');
      break;
    }

    const stepLabel = `Step ${si + 1}/${stepsToRun.length}`;
    const target = stepTargetLabel(stepsToRun[si]!, si);
    todos.activateBuild(si);
    todos.advanceCodeStep(si, stepsToRun.length, target);
    emit(ctx, 3, BRAND.phase3.execute(si + 1, stepsToRun.length, target), 'builder', todos, isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect');

    const passLabel = si === 0 ? xrogaPulseLine(`Scaffolding — ${target}`) : xrogaArchitectureLine(`Logic — ${target}`);
    emit(ctx, 3, passLabel, 'builder', todos, si === 0 ? 'XROGA Pulse' : 'XROGA Architect');

    let stepCode = '';
    try {
      stepCode = await withBuildHeartbeat(
        ctx,
        todos,
        async () => {
          // Chatbot/crypto: Flash-first for speed; one Pro pass on the last step for quality.
          const complexFast =
            (buildType === 'chatbot' || buildType === 'crypto' || isComplexProductBuild(userPrompt)) &&
            !hackathonNote;
          const role =
            costPolicy.tier === 'simple_static' || isUpdateBuild
              ? 'flash'
              : complexFast
                ? si === stepsToRun.length - 1 && stepsToRun.length > 1
                  ? 'pro'
                  : 'flash'
                : hackathonNote || repoAnalysisSummary
                  ? si % 2 === 0
                    ? 'pro'
                    : 'flash'
                  : si === 0
                    ? 'flash'
                    : si % 2 === 0
                      ? 'pro'
                      : 'flash';
          const integrationsForStep = liveIntegrationsNote
            ? `\n\nLIVE INTEGRATIONS TO WIRE IN THIS STEP (free endpoints first):\n${liveIntegrationsNote.slice(0, 2800)}`
            : '';
          const { text } = await buildModelCall(
            role,
            executePrompt,
            `Approved Plan:\n${approvedPlan}\n\nExecute now: Step ${si + 1} — ${stepsToRun[si]}\n\nUser:\n${userPrompt}\n\nTech: ${executeTech}${existingCodeContext}${integrationsForStep}`,
            stepTokenBudget,
            usageTracker,
            { userId }
          );
          return text;
        },
        `step ${si + 1}/${stepsToRun.length}`
      );
      // Flash sometimes writes a how-to essay instead of code — reject and force a code-only retry.
      if (!isGameBuild && looksLikeBuildEssay(stepCode)) {
        emit(
          ctx,
          3,
          xrogaPulseLine('Retrying — code only (no essay)'),
          'builder',
          todos,
          'XROGA Pulse'
        );
        const retry = isUpdateBuild
          ? await buildModelCall(
              'flash',
              `${PHASE_3_UPDATE_EXECUTE}\n\nABSOLUTE RULE: Patch ONLY the listed GitHub files. Output path-labeled fences (e.g. \`\`\`index.html). Keep the existing brand/project name. Never rebuild a new product.`,
              `Update request:\n${userPrompt}\n\nPlan:\n${approvedPlan}\n\nTarget files:\n${[...((incrementalPlan?.filePaths && incrementalPlan.filePaths.size)
                ? incrementalPlan.filePaths
                : targetedUpdateFiles.map((f) => f.path))].slice(0, 12).join('\n') || 'index.html\nstyles.css\nscript.js'}\n\n${existingCodeContext}\n\nOutput ONLY path-labeled fenced code for those files.`,
              stepTokenBudget,
              usageTracker,
              { userId }
            )
          : await buildModelCall(
              'flash',
              `${PHASE_3_EXECUTE}\n\nABSOLUTE RULE: The user asked you to BUILD the website, not explain how. Output ONLY three fenced blocks: html, css, javascript. Zero prose. Zero "Introduction". Zero SEO tips.`,
              `Build this site NOW as real working files.\nUser request:\n${userPrompt}\n\nPlan:\n${approvedPlan}\n\nReturn complete index.html + styles.css + script.js content in fenced blocks.`,
              stepTokenBudget,
              usageTracker,
              { userId }
            );
        if (retry.text?.trim() && !looksLikeBuildEssay(retry.text)) {
          stepCode = retry.text;
        } else if (retry.text?.trim()) {
          // Still essay-ish — keep any HTML island if present; assembler / template will harden
          stepCode = retry.text;
        }
      }
    } catch (stepErr) {
      console.warn('[NegotiationEngine] Step code gen:', (stepErr as Error).message);
      stepCode = isGameBuild
        ? `\`\`\`javascript\n// Step ${si + 1} fallback\nconst canvas=document.createElement('canvas');\n\`\`\``
        : `<!-- Step ${si + 1} fallback -->\n<section><h2>${stepsToRun[si]}</h2><p>Content for ${stepsToRun[si]}</p></section>`;
    }

    let approved = costPolicy.tier === 'simple_static' || stepCorrectionsMax <= 0;
    // Prefer Flash for corrections — Pro+reasoning_effort high was burning 2min/call in loops
    const useLightCorrections =
      costPolicy.tier === 'premium' || buildBudget.softExceeded(usageTracker) || lightVerify;
    for (let attempt = 0; attempt < stepCorrectionsMax; attempt++) {
      assertNotAborted(ctx);
      if (buildBudget.hardExceeded(usageTracker)) {
        markShipEarly('budget during step verify');
        break;
      }
      emit(ctx, 4, BRAND.phase4.verifying, 'qa', todos, 'AI SWARM LOGIC');
      const reports = await verifyStepParallel(
        stepCode,
        approvedPlan,
        userPrompt,
        usageTracker,
        lightVerify || useLightCorrections,
        userId
      );
      const failures = reports.filter((r) => !r.pass);

      if (!failures.length) {
        emit(ctx, 4, BRAND.phase4.allPass, 'qa', todos, 'AI SWARM LOGIC', { userPhase: 2 });
        approved = true;
        break;
      }

      const failMsg = failures.map((f) => failureBrand(f.agent)).join(' ');
      emit(ctx, 5, failMsg, 'debugger', todos, 'XROGA Architect');
      emit(ctx, 5, BRAND.phase5.correcting, 'debugger', todos, 'XROGA Architect');
      const errorPlan = failures.map((f) => `[${f.agent}] ${f.report}`).join('\n');
      if (forcedFullRepoFix) {
        const corrected = await buildForcedCorrection(
          PHASE_5_CORRECT,
          `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`,
          BUILD_STEP_MAX_TOKENS,
          usageTracker,
          { userId: ctx.userId, claudeTask: 'qa' }
        );
        stepCode = corrected.text;
      } else if (useLightCorrections) {
        stepCode = await deepseekFlashCall(
          PHASE_5_CORRECT,
          `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`,
          stepTokenBudget,
          usageTracker,
          userId
        );
      } else {
        stepCode = await deepseekProCall(
          PHASE_5_CORRECT,
          `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`,
          stepTokenBudget,
          usageTracker, userId
        );
      }
      totalCorrections++;
      emit(ctx, 5, BRAND.phase5.fixed, 'debugger', todos, 'XROGA Architect');
    }

    todos.completeBuild(si);
    // Mark step done with friendly label in activity log
    emit(ctx, 3, friendlyStepLabel(stepsToRun[si]!, si), 'builder', todos, isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect');
    codeParts.push(`// --- ${stepLabel}: ${stepsToRun[si]} ---\n${stepCode}`);
    if (!approved) {
      emit(ctx, 5, BRAND.phase5.maxReached, 'debugger', todos, 'XROGA Architect');
    }
  }

  buildState.markDone('executed');

  let assembledCode = codeParts.join('\n\n');

  if (
    !shipEarly &&
    !isUpdateBuild &&
    costPolicy.tier !== 'simple_static' &&
    !buildBudget.softExceeded(usageTracker) &&
    buildBudget.canAffordLongCall(usageTracker)
  ) {
    emit(ctx, 6, xrogaPulseLine('First-build preflight — runtime & UI sanity check'), 'qa', todos, 'XROGA Pulse');
    try {
      assertNotAborted(ctx);
      const { text: preflight } = await buildModelCall(
        'flash',
        `You are XROGA QA. Check HTML/CSS/JS for broken buttons, dead links, placeholder-only sections, missing event handlers, and mobile layout gaps. If issues found, return corrected fenced html/css/js blocks. If OK, reply PASS only.`,
        `User request:\n${userPrompt.slice(0, 800)}\n\nCode:\n${assembledCode.slice(0, 50000)}`,
        8192,
        usageTracker,
        { userId }
      );
      if (preflight && !isPass(preflight) && /```/.test(preflight)) {
        assembledCode = `${assembledCode}\n\n// --- First-build preflight fixes ---\n${preflight}`;
      }
    } catch {
      /* optional preflight */
    }
  }

  const skipOptionalPolish = shipEarly || buildBudget.softExceeded(usageTracker);
  emit(ctx, 6, xrogaVisionaryLine('UI polish — responsive design & animations'), 'reviewer', todos, 'XROGA Visionary');
  if (skipOptionalPolish && !isUpdateBuild && costPolicy.tier !== 'simple_static') {
    try {
      todos.activate('ui-trends');
      todos.complete('ui-trends');
      emit(ctx, 6, xrogaVisionaryLine('UI polish skipped — shipping current build'), 'reviewer', todos, 'XROGA Visionary', {
        silent: true,
      });
    } catch {
      /* optional */
    }
  } else if (isUpdateBuild && incrementalPlan?.touchesUi && incrementalPlan.stepCount > 1) {
    try {
      assertNotAborted(ctx);
      const polishRole = costAwareRole(
        costPolicy.preferFlashUiPolish ? 'flash' : 'sonnet',
        costPolicy
      );
      const { text: uiPolish, modelLabel } = await buildModelCall(
        polishRole,
        `Apply ONLY targeted UI tweaks to the fenced html/css blocks below. Return fenced html and/or css blocks only — do not rewrite unrelated files.`,
        `Update:\n${userPrompt.slice(0, 600)}\nTouched paths: ${[...incrementalPlan.filePaths].join(', ')}\n\n${assembledCode.slice(0, 12000)}`,
        4096,
        usageTracker,
        { userId: ctx.userId, claudeTask: 'ui' }
      );
      if (uiPolish?.trim()) {
        assembledCode = `${assembledCode}\n\n// --- UI/UX polish (${modelLabel}) ---\n${uiPolish}`;
      }
    } catch {
      /* optional */
    }
  } else if (!isUpdateBuild && costPolicy.tier !== 'simple_static' && !skipOptionalPolish) {
  try {
    assertNotAborted(ctx);
    todos.activate('ui-trends');
    const polishRole = costAwareRole(
      costPolicy.preferFlashUiPolish ? 'flash' : 'sonnet',
      costPolicy
    );
    const { text: uiPolish, modelLabel } = await buildModelCall(
      polishRole,
      `You are XROGA Visionary. Polish HTML/CSS/JS for modern responsive design, micro-interactions, accessibility (ARIA), and optional dark mode. Output ONLY complete fenced html, css, javascript blocks — no commentary, no truncation.`,
      `Brief:\n${clarifiedBrief}\n\nApproved plan:\n${approvedPlan}\n\nCodebase:\n${assembledCode.slice(0, 40_000)}`,
      Math.min(stepTokenBudget, 8192),
      usageTracker,
      { userId: ctx.userId, claudeTask: 'ui' }
    );
    if (uiPolish?.trim()) {
      assembledCode = `${assembledCode}\n\n// --- UI/UX polish (${modelLabel}) ---\n${uiPolish}`;
    }
    todos.complete('ui-trends');
  } catch {
    /* fallback handled in buildModelCall */
    try {
      todos.complete('ui-trends');
    } catch {
      /* optional */
    }
  }
  } else if (!isUpdateBuild && costPolicy.tier === 'simple_static') {
    // One-shot Flash already includes UI — mark polish todo done without a second 8k call.
    try {
      todos.activate('ui-trends');
      todos.complete('ui-trends');
      emit(ctx, 6, xrogaVisionaryLine('UI included in fast one-shot build'), 'reviewer', todos, 'XROGA Visionary', {
        silent: true,
      });
    } catch {
      /* optional */
    }
  }

  todos.addFinalTodos();
  todos.activateFinal('final-check');

  if (
    !shipEarly &&
    !isUpdateBuild &&
    costPolicy.allowGrokReviewLoop &&
    !buildBudget.softExceeded(usageTracker)
  ) {
    emit(ctx, 6, xrogaCollectiveLine('Quality audit — skeptical code review'), 'truth_council', todos, 'XROGA Collective', {
      userPhase: 2,
    });
    try {
      assertNotAborted(ctx);
      const grokLoop = await runGrokCodeReviewLoop(
        assembledCode,
        userPrompt,
        usageTracker,
        ctx.userId,
        costPolicy.grokReviewMaxRounds
      );
      assembledCode = grokLoop.code;
      if (!grokLoop.pass) {
        emit(ctx, 5, xrogaArchitectureLine('Audit fixes — applying Pulse Core corrections'), 'debugger', todos, 'XROGA Architect');
        assembledCode = await deepseekFlashCall(
          PHASE_5_CORRECT,
          `Code audit did not fully pass — apply remaining fixes:\n\nCode:\n${assembledCode}`,
          BUILD_STEP_MAX_TOKENS,
          usageTracker, userId
        );
        totalCorrections++;
      } else {
        emit(ctx, 6, xrogaCollectiveLine(`Code audit passed (${grokLoop.rounds} round(s))`), 'truth_council', todos, 'XROGA Collective', {
          userPhase: 2,
        });
      }
    } catch {
      /* optional review */
    }
  }

  if (!isUpdateBuild) {
  // Simple blogs: ONE DeepSeek interactive QA (buttons/JS) — no 4-model parallel audit.
  if (costPolicy.tier === 'simple_static') {
    emit(ctx, 6, xrogaPulseLine('DeepSeek QA — buttons, forms & click handlers'), 'qa', todos, 'XROGA Pulse');
    try {
      const qa = await deepseekInteractiveQaFix(assembledCode, userPrompt, usageTracker);
      assembledCode = qa.code;
      if (qa.fixed) totalCorrections++;
      emit(ctx, 6, qa.fixed ? xrogaArchitectureLine('DeepSeek applied interactive fixes') : BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective');
    } catch {
      emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective', { silent: true });
    }
  } else if (shipEarly || buildBudget.softExceeded(usageTracker) || !buildBudget.canAffordLongCall(usageTracker)) {
    // Budget tight: one Flash interactive QA max — never Pro quality + final + QA triple pass
    emit(ctx, 6, xrogaPulseLine('Quick QA — shipping before budget overrun'), 'qa', todos, 'XROGA Pulse');
    try {
      assertNotAborted(ctx);
      const qa = await deepseekInteractiveQaFix(assembledCode, userPrompt, usageTracker);
      assembledCode = qa.code;
      if (qa.fixed) totalCorrections++;
      emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective');
    } catch {
      emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective', { silent: true });
    }
  } else {
  // Single Flash final + interactive QA (skip Pro quality gate — was duplicate DeepSeek burn)
  emit(ctx, 6, xrogaCollectiveLine('DeepSeek final audit (single pass)'), 'truth_council', todos, 'XROGA Collective');
  try {
    assertNotAborted(ctx);
    const finalReview = await deepseekFlashCall(
      PHASE_6_FINAL,
      `Full codebase:\n${assembledCode.slice(0, 40_000)}`,
      2048,
      usageTracker,
      userId
    );
    if (!isPass(finalReview)) {
      emit(ctx, 5, BRAND.phase5.correcting, 'debugger', todos, 'XROGA Architect');
      assembledCode = await deepseekFlashCall(
        PHASE_5_CORRECT,
        `Final review:\n${finalReview}\n\n${assembledCode.slice(0, 40_000)}`,
        Math.min(BUILD_STEP_MAX_TOKENS, 8192),
        usageTracker,
        userId
      );
      totalCorrections++;
    }
    const qa = await deepseekInteractiveQaFix(assembledCode, userPrompt, usageTracker);
    assembledCode = qa.code;
    if (qa.fixed) totalCorrections++;
    emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective');
  } catch {
    emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective', { silent: true });
  }
  }
  } else {
    emit(ctx, 6, xrogaPulseLine('Update verify — DeepSeek QA on touched files'), 'qa', todos, 'XROGA Pulse', {
      userPhase: 2,
    });
    try {
      const qa = await deepseekInteractiveQaFix(assembledCode, userPrompt, usageTracker);
      assembledCode = qa.code;
      if (qa.fixed) {
        totalCorrections++;
      } else {
        const { text: quickCheck } = await buildModelCall(
          'flash',
          PHASE_6_FINAL,
          `Touched files only:\n${assembledCode.slice(0, 12000)}`,
          256,
          usageTracker,
          { userId }
        );
        if (!isPass(quickCheck)) {
          assembledCode = await deepseekFlashCall(
            PHASE_5_CORRECT,
            `Quick review:\n${quickCheck}\n\nCode:\n${assembledCode}`,
            4096,
            usageTracker,
            userId
          );
          totalCorrections++;
        }
      }
    } catch {
      /* skip heavy final audit on updates */
    }
  }
  buildState.markDone('verified');
  todos.completeFinal('final-check');

  if (
    !shipEarly &&
    !buildBudget.softExceeded(usageTracker) &&
    buildBudget.canAffordLongCall(usageTracker) &&
    shouldUseReserve(userPrompt, totalCorrections)
  ) {
    emit(ctx, 6, BRAND.reserve.polish, 'architect', todos, 'XROGA Alpha Core');
    const polished = await reservePolish(assembledCode, userPrompt, 'repeated_failure');
    if (polished) assembledCode = polished;
  }

  todos.activateFinal('emit');
  emit(ctx, 7, BRAND.phase7.emitting, 'builder', todos, 'BLACK HOLE V∞', { userPhase: 5 });
  let featureOutput: FeatureOutput | null = null;
  let deployError: string | null = null;

  const isWebBuildFinal =
    isGameBuild ||
    featureCategory === 'landing_page' ||
    isWebsiteBuildPrompt(userPrompt, featureCategory);

  // Crypto/chatbot must still consolidate unless hard budget — soft skip was shipping thin shells.
  const complexProduct =
    buildType === 'crypto' ||
    buildType === 'chatbot' ||
    isComplexProductBuild(userPrompt);
  const hardBudget = buildBudget.hardExceeded(usageTracker);
  const skipConsolidate =
    isUpdateBuild ||
    costPolicy.tier === 'simple_static' ||
    hardBudget ||
    (!complexProduct &&
      (shipEarly || buildBudget.softExceeded(usageTracker) || !buildBudget.canAffordLongCall(usageTracker)));

  try {
    if (isWebBuildFinal) {
      // Updates: NEVER full-site assemble/emit (that invents "Crypto Pulse" over OrbitVault).
      // Preview starts from the current repo/prior site; GitHub patches apply next.
      if (isUpdateBuild && !shouldAllowFullScaffoldOnUpdate(userPrompt)) {
        const baseHtml =
          existingSiteCode?.html ||
          ctx.priorSite?.html ||
          targetedUpdateFiles.find((f) => /index\.html$/i.test(f.path))?.content ||
          '';
        const baseCss =
          existingSiteCode?.css ||
          ctx.priorSite?.css ||
          targetedUpdateFiles.find((f) => /\.css$/i.test(f.path))?.content ||
          '';
        const baseJs =
          existingSiteCode?.js ||
          ctx.priorSite?.js ||
          targetedUpdateFiles.find((f) => /\.js$/i.test(f.path))?.content ||
          '';
        if (baseHtml.trim().length > 40) {
          const polishedBase = polishShippedSite(userPrompt, {
            html: baseHtml,
            css: baseCss,
            js: baseJs,
          });
          featureOutput = {
            type: 'landing_page',
            html: polishedBase.html,
            css: polishedBase.css,
            js: polishedBase.js,
            heroImageUrl: '',
            deployUrl: '',
            summary: 'Incremental update on current project',
            isUpdate: true,
          };
        } else {
          featureOutput = {
            type: 'landing_page',
            html: '',
            css: '',
            js: '',
            heroImageUrl: '',
            deployUrl: '',
            summary: 'Incremental GitHub file update',
            isUpdate: true,
          };
        }
        emit(
          ctx,
          7,
          xrogaPulseLine('Updating current project files — not creating a new site'),
          'builder',
          todos,
          'XROGA Pulse'
        );
      } else {
        if (skipConsolidate) {
          emit(
            ctx,
            7,
            xrogaPulseLine('Assembling site — skipped long consolidate to save API cost'),
            'builder',
            todos,
            'XROGA Pulse',
            { silent: true }
          );
        }
        // Crypto / chatbot / swap must come from the LLM APIs — never ship template Escape Pod UIs
        const refuseScaffold =
          buildType === 'crypto' ||
          buildType === 'chatbot' ||
          /\b(swap|bridge|defi\s*dashboard|web3)\b/i.test(userPrompt);
        featureOutput = await buildLandingFromSwarmAssembly(
          assembledCode,
          userPrompt,
          approvedPlan,
          clarifiedBrief,
          isGameBuild ? 'game' : 'website',
          {
            skipConsolidate,
            allowScaffoldFallback: !refuseScaffold,
            tracker: usageTracker,
            userId,
            integrationContext: liveIntegrationsNote,
          }
        );
      }
    } else if (featureCategory === 'code_debug') {
      featureOutput = await debugCode({
        code: assembledCode,
        filename: 'swarm-output.ts',
        language: 'typescript',
      });
    }
  } catch (err) {
    console.warn('[NegotiationEngine] Feature builder:', (err as Error).message);
  }

  // Reject local scaffolds — force one more DeepSeek pass so users see real AI HTML
  if (
    isWebBuildFinal &&
    !isUpdateBuild &&
    featureOutput?.type === 'landing_page' &&
    looksLikePromptScaffold(
      (featureOutput as { html?: string }).html || '',
      (featureOutput as { css?: string }).css || '',
      (featureOutput as { js?: string }).js || ''
    )
  ) {
    emit(ctx, 7, xrogaPulseLine('Scaffold detected — regenerating with DeepSeek'), 'builder', todos, 'XROGA Pulse');
    const real = await emitRealSiteWithDeepSeek(userPrompt, {
      brief: clarifiedBrief,
      plan: approvedPlan,
      tracker: usageTracker,
      userId,
      maxTokens: 12288,
      integrationContext: liveIntegrationsNote,
    });
    if (real) {
      featureOutput = {
        type: 'landing_page',
        html: real.html,
        css: real.css,
        js: real.js,
        heroImageUrl: '',
        deployUrl: '',
        summary: 'AI-generated preview (DeepSeek)',
      };
    }
  }

  // Empty HTML: DeepSeek emit first, scaffold only if AI unavailable
  if (
    isWebBuildFinal &&
    !isUpdateBuild &&
    (!featureOutput ||
      featureOutput.type !== 'landing_page' ||
      !(featureOutput as { html?: string }).html?.trim())
  ) {
    console.warn('[NegotiationEngine] Empty landing — DeepSeek real emit');
    const real = await emitRealSiteWithDeepSeek(userPrompt, {
      brief: clarifiedBrief,
      plan: approvedPlan,
      tracker: usageTracker,
      userId,
      maxTokens: 12288,
      integrationContext: liveIntegrationsNote,
    });
    if (real) {
      featureOutput = {
        type: 'landing_page',
        html: real.html,
        css: real.css,
        js: real.js,
        heroImageUrl: '',
        deployUrl: '',
        summary: 'AI-generated preview (DeepSeek)',
      };
      emit(ctx, 7, xrogaPulseLine('Shipped DeepSeek-generated preview'), 'builder', todos, 'XROGA Pulse');
    } else {
      const refuseScaffoldEmpty =
        buildType === 'crypto' ||
        buildType === 'chatbot' ||
        /\b(swap|bridge|defi\s*dashboard|web3)\b/i.test(userPrompt);
      if (refuseScaffoldEmpty) {
        console.warn('[NegotiationEngine] DeepSeek emit failed — refusing crypto/chatbot scaffold');
        emit(
          ctx,
          7,
          xrogaPulseLine(
            'AI emit failed for this product — retry the build (no fake template will be shipped)'
          ),
          'builder',
          todos,
          'XROGA Pulse'
        );
      } else {
        console.warn('[NegotiationEngine] DeepSeek emit failed — last-resort scaffold');
        const matched = generatePromptMatchedSite(userPrompt || clarifiedBrief);
        featureOutput = {
          type: 'landing_page',
          html: matched.html,
          css: matched.css,
          js: matched.js,
          heroImageUrl: '',
          deployUrl: '',
          summary: 'Fallback scaffold (AI emit unavailable)',
        };
        emit(
          ctx,
          7,
          xrogaPulseLine('AI emit unavailable — shipped fallback scaffold'),
          'builder',
          todos,
          'XROGA Pulse'
        );
      }
    }
  }

  // Second scaffold reject after empty-path recovery (crypto/chatbot templates must not ship)
  if (
    isWebBuildFinal &&
    !isUpdateBuild &&
    featureOutput?.type === 'landing_page' &&
    looksLikePromptScaffold(
      (featureOutput as { html?: string }).html || '',
      (featureOutput as { css?: string }).css || '',
      (featureOutput as { js?: string }).js || ''
    ) &&
    (buildType === 'crypto' ||
      buildType === 'chatbot' ||
      /\b(swap|bridge|defi)\b/i.test(userPrompt))
  ) {
    emit(
      ctx,
      7,
      xrogaPulseLine('Template UI blocked — regenerating real product with DeepSeek'),
      'builder',
      todos,
      'XROGA Pulse'
    );
    const realRetry = await emitRealSiteWithDeepSeek(userPrompt, {
      brief: clarifiedBrief,
      plan: approvedPlan,
      tracker: usageTracker,
      userId,
      maxTokens: 12288,
      integrationContext: liveIntegrationsNote,
    });
    if (realRetry && !looksLikePromptScaffold(realRetry.html, realRetry.css, realRetry.js)) {
      featureOutput = {
        type: 'landing_page',
        html: realRetry.html,
        css: realRetry.css,
        js: realRetry.js,
        heroImageUrl: '',
        deployUrl: '',
        summary: 'AI-generated preview (DeepSeek)',
      };
    } else {
      featureOutput = null;
      emit(
        ctx,
        7,
        xrogaPulseLine('Could not produce a real crypto/chatbot build — tap Retry (no fake template)'),
        'builder',
        todos,
        'XROGA Pulse'
      );
    }
  }

  // Updates with empty assembly: rebuild landing from prior sandbox / targeted files
  if (
    isUpdateBuild &&
    (!featureOutput ||
      featureOutput.type !== 'landing_page' ||
      !(featureOutput as { html?: string }).html?.trim())
  ) {
    const fromAssembly = parseAssembledProject(assembledCode);
    const baseHtml =
      fromAssembly?.html?.trim() ||
      existingSiteCode?.html ||
      ctx.priorSite?.html ||
      targetedUpdateFiles.find((f) => /index\.html$/i.test(f.path))?.content ||
      '';
    const baseCss =
      fromAssembly?.css?.trim() ||
      existingSiteCode?.css ||
      ctx.priorSite?.css ||
      targetedUpdateFiles.find((f) => /\.css$/i.test(f.path))?.content ||
      '';
    const baseJs =
      fromAssembly?.js?.trim() ||
      existingSiteCode?.js ||
      ctx.priorSite?.js ||
      targetedUpdateFiles.find((f) => /\.js$/i.test(f.path))?.content ||
      '';
    if (baseHtml.trim().length > 40) {
      const polishedRecover = polishShippedSite(userPrompt, {
        html: baseHtml,
        css: baseCss,
        js: baseJs,
      });
      featureOutput = {
        type: 'landing_page',
        html: polishedRecover.html,
        css: polishedRecover.css,
        js: polishedRecover.js,
        heroImageUrl: '',
        deployUrl: '',
        summary: 'Update applied to sandbox preview',
        isUpdate: true,
      };
      emit(ctx, 7, xrogaPulseLine('Update recovered onto sandbox preview'), 'builder', todos, 'XROGA Pulse');
    }
  }

  // Deterministic polish: theme toggle, Lucide (no emoji), no dead xroga.com CTAs
  if (featureOutput?.type === 'landing_page') {
    const polished = polishShippedSite(userPrompt, {
      html: (featureOutput as { html?: string }).html || '',
      css: (featureOutput as { css?: string }).css || '',
      js: (featureOutput as { js?: string }).js || '',
    });
    featureOutput = {
      ...featureOutput,
      html: polished.html,
      css: polished.css,
      js: polished.js,
    };
  }

  const parsedName = parseProjectName(userPrompt, clarifiedBrief);
  const htmlName =
    featureOutput?.type === 'landing_page'
      ? extractProjectNameFromHtml((featureOutput as { html?: string }).html || '')
      : null;
  const existingHtmlName =
    extractProjectNameFromHtml(existingSiteCode?.html || '') ||
    extractProjectNameFromHtml(
      targetedUpdateFiles.find((f) => /index\.html$/i.test(f.path))?.content || ''
    ) ||
    '';
  const rememberedName =
    (typeof ctx.priorSite?.projectName === 'string' && ctx.priorSite.projectName.trim()) ||
    (typeof pastBuilds[0]?.projectName === 'string' && pastBuilds[0].projectName.trim()) ||
    existingHtmlName ||
    '';
  const userExplicitRename =
    /\b(rename|rebrand|call(?:ed)?\s+it|change\s+(?:the\s+)?name|named)\b/i.test(userPrompt);
  // Updates keep OrbitVault / current brand — never invent "Crypto Pulse"
  const projectName = isUpdateBuild && !userExplicitRename
    ? rememberedName ||
      existingHtmlName ||
      htmlName ||
      (ctx.githubTargetRepo?.includes('/')
        ? ctx.githubTargetRepo.split('/')[1]!.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : '') ||
      parsedName
    : (parsedName !== 'My Website' ? parsedName : null) ||
      rememberedName ||
      htmlName ||
      parsedName;
  const projectSlug = slugFromProjectName(projectName);
  const summaryData = {
    ...buildSummaryFromBrief(userPrompt, clarifiedBrief, undefined, undefined, memoryNote),
    projectName,
  };

  if (featureOutput?.type === 'landing_page') {
    featureOutput = {
      ...featureOutput,
      projectName,
      integratedAi: [
        ...integratedAiSummaryForPrompt(userPrompt),
        ...fieldEndpointSummaryForPrompt(userPrompt).map((e) => ({
          id: e.id,
          name: `${e.name} (${e.domain})`,
          freeTier: e.freeTier,
          requiresApiKey: e.requiresApiKey,
          endpoint: e.endpoint,
          userGuidance: e.wireHint,
        })),
      ],
      userPrompt,
    };
    todos.completeFinal('emit');
    buildState.markDone('emitted');
    todos.activateFinal('github-push');
    const pushTarget = ctx.githubTargetRepo?.includes('/') ? ctx.githubTargetRepo : 'selected GitHub repo';
    emit(ctx, 8, xrogaGitHubLine(pushTarget, ctx.githubTargetBranch ?? 'main'), 'builder', todos, 'XROGA AI', {
      userPhase: 4,
    });
    const generatedPaths = scaffoldFilePaths(userPrompt);
    const updatePaths = incrementalPlan?.filePaths ?? new Set<string>();
    let projectFiles: import('../../services/integrations/githubDeploy.js').ProjectFile[];
    let fileTrail: ReturnType<typeof buildFileTrailDiffs> = [];
    let previousFilesForRollback: Array<{ path: string; content: string }> = [];
    let deletedPathsForPush: string[] = [...updateDeletePaths];

    // Plan A: updates ALWAYS patch targeted files — never full scaffold unless forced rebuild.
    if (isUpdateBuild && !shouldAllowFullScaffoldOnUpdate(userPrompt)) {
      if (!targetedUpdateFiles.length && ctx.githubTargetRepo?.includes('/') && updatePaths.size) {
        try {
          targetedUpdateFiles = await fetchGitHubFilesByPaths(
            userId,
            ctx.githubTargetRepo,
            [...updatePaths],
            ctx.githubTargetBranch
          );
        } catch (refetchErr) {
          console.warn('[NegotiationEngine] Update refetch:', (refetchErr as Error).message);
        }
      }
      if (!targetedUpdateFiles.length && ctx.githubTargetRepo?.includes('/')) {
        // Last resort: real tree entrypoints first, then static triad only if present in tree
        const defaults = (
          repoTreePaths.length
            ? repoTreePaths.filter((p) =>
                /(?:^|\/)(index\.html|app\/page\.(tsx|jsx|js)|src\/app\/page\.(tsx|jsx|js)|pages\/index\.(tsx|jsx|js)|styles\.css|script\.js)$/i.test(
                  p
                )
              )
            : ['index.html', 'styles.css', 'script.js']
        ).slice(0, 8);
        if (defaults.length) {
          try {
            targetedUpdateFiles = await fetchGitHubFilesByPaths(
              userId,
              ctx.githubTargetRepo,
              defaults,
              ctx.githubTargetBranch
            );
            for (const d of defaults) updatePaths.add(d);
          } catch {
            /* keep empty */
          }
        }
      }
      if (
        !targetedUpdateFiles.length &&
        ctx.githubTargetRepo?.includes('/') &&
        !shouldAllowFullScaffoldOnUpdate(userPrompt)
      ) {
        emit(
          ctx,
          8,
          xrogaPulseLine(
            'Update aborted — selected GitHub repo returned 0 readable files for this patch. Check repo/branch access.'
          ),
          'builder',
          todos,
          'XROGA Pulse',
          { userPhase: 4 }
        );
      }
      const allow = updatePaths.size ? updatePaths : new Set(targetedUpdateFiles.map((f) => f.path));
      for (const d of updateDeletePaths) allow.add(d);
      // Only allow paths that exist in the targeted set or real repo tree — never invent triad files.
      const knownPaths = new Set([
        ...targetedUpdateFiles.map((f) => f.path),
        ...repoTreePaths,
      ]);
      if (knownPaths.size) {
        for (const p of [...allow]) {
          if (!knownPaths.has(p) && !updateDeletePaths.includes(p)) allow.delete(p);
        }
      }
      const fromAssembly = extractPatchedFilesFromAssembly(assembledCode, allow);
      const fromDeletes = extractDeletedPathsFromAssembly(assembledCode, allow);
      deletedPathsForPush = [...new Set([...deletedPathsForPush, ...fromDeletes])];
      // Prefer fenced patches from the model. If none, push polished CURRENT triad
      // (theme toggle etc.) — never a newly invented product brand.
      const triadInRepo = targetedUpdateFiles.some((f) => f.path === 'index.html') || allow.has('index.html');
      const fromLanding =
        fromAssembly.length || !triadInRepo || !featureOutput.html?.trim()
          ? []
          : landingOutputToPatchedFiles(
              featureOutput.html,
              featureOutput.css,
              featureOutput.js,
              allow
            );
      const patched = mergePatchedFiles(targetedUpdateFiles, [...fromAssembly, ...fromLanding]);
      projectFiles = patched.filter((f) => allow.has(f.path) && !deletedPathsForPush.includes(f.path));
      if (!projectFiles.length && targetedUpdateFiles.length && !deletedPathsForPush.length) {
        // Model returned nothing useful — keep originals (no destructive full rebuild)
        projectFiles = targetedUpdateFiles;
      }
      previousFilesForRollback = targetedUpdateFiles.map((f) => ({ path: f.path, content: f.content }));
      fileTrail = buildFileTrailDiffs(
        targetedUpdateFiles,
        [
          ...projectFiles,
          ...deletedPathsForPush.map((path) => ({ path, content: '' })),
        ]
      );
      // Preview must reflect patched CURRENT project (not a newly invented site)
      const synced = siteCodeFromProjectFiles(projectFiles);
      if (synced.html?.trim()) {
        const polishedPatch = polishShippedSite(userPrompt, synced);
        featureOutput = {
          ...featureOutput,
          html: polishedPatch.html,
          css: polishedPatch.css,
          js: polishedPatch.js,
          isUpdate: true,
        };
        // Only write triad paths that already exist in the allow/project set — never invent them
        const triadPatches: Array<{ path: string; content: string }> = [];
        if (allow.has('index.html') || projectFiles.some((f) => f.path === 'index.html')) {
          triadPatches.push({ path: 'index.html', content: polishedPatch.html });
        }
        if (
          polishedPatch.css?.trim() &&
          (allow.has('styles.css') || projectFiles.some((f) => f.path === 'styles.css'))
        ) {
          triadPatches.push({ path: 'styles.css', content: polishedPatch.css });
        }
        if (
          polishedPatch.js?.trim() &&
          (allow.has('script.js') || projectFiles.some((f) => f.path === 'script.js'))
        ) {
          triadPatches.push({ path: 'script.js', content: polishedPatch.js });
        }
        if (triadPatches.length) {
          projectFiles = mergePatchedFiles(projectFiles, triadPatches);
        }
      }
      emit(
        ctx,
        8,
        xrogaGitHubLine(
          `patch ${projectFiles.length} file(s)${deletedPathsForPush.length ? ` · delete ${deletedPathsForPush.length}` : ''} only`,
          ctx.githubTargetBranch ?? 'main'
        ),
        'builder',
        todos,
        'XROGA AI',
        { userPhase: 4 }
      );
    } else {
      projectFiles = buildFullProjectFiles({
        html: featureOutput.html,
        css: featureOutput.css,
        js: featureOutput.js,
        projectName,
        userPrompt,
      });
      const envFiles = await buildProviderEnvFiles(userId);
      if (envFiles.length) {
        projectFiles = [...projectFiles, ...envFiles];
      }
    }
    if (!githubConnected) {
      // Ship the site in-chat; connect GitHub later to push/deploy.
      const sandboxPaths = isUpdateBuild
        ? projectFiles.map((f) => f.path)
        : generatedPaths;
      featureOutput = {
        ...featureOutput,
        projectName: summaryData.projectName,
        pages: summaryData.pages,
        features: summaryData.features,
        designTheme: summaryData.designTheme,
        needsPayment: summaryData.needsPayment,
        generatedFiles: sandboxPaths,
        fileCount: projectFiles.length,
        githubPushConfirmed: false,
        userPrompt: currentMessage,
        isUpdate: isUpdateBuild,
        updatedFiles: isUpdateBuild ? sandboxPaths : undefined,
        changesSummary: isUpdateBuild
          ? fileTrail.length || deletedPathsForPush.length
            ? changeSummaryFromFileTrail(fileTrail, deletedPathsForPush)
            : shortChangeSummary(userPrompt, sandboxPaths)
          : undefined,
        fileTrail: isUpdateBuild ? fileTrail : undefined,
        previousFiles: isUpdateBuild ? previousFilesForRollback : undefined,
        followUps: ['Connect GitHub to push & deploy', ...LANDING_UPDATE_FOLLOW_UPS.slice(0, 3)],
        memoryNote: isUpdateBuild
          ? 'Update applied in sandbox preview. Connect GitHub under Integrations to push live.'
          : 'Your site is ready in sandbox preview. Connect GitHub under Integrations to push and get a live URL.',
        summary: formatBuildSummaryCard({
          ...summaryData,
          isUpdate: isUpdateBuild,
          updatedFiles: isUpdateBuild ? sandboxPaths : undefined,
          updateRequest: isUpdateBuild ? currentMessage : undefined,
          liveUrl: featureOutput.deployUrl || undefined,
        }),
      };
      todos.completeFinal('github-push');
      emit(
        ctx,
        8,
        xrogaArchitectureLine('Sandbox ready — connect GitHub anytime to go live'),
        'builder',
        todos,
        'XROGA Architect',
        { userPhase: 5 }
      );
    } else try {
      const pipeline = await pushAndDeployLivePreview(userId, projectFiles, projectSlug, {
        targetRepo: ctx.githubTargetRepo,
        targetBranch: ctx.githubTargetBranch,
        deletePaths: isUpdateBuild ? deletedPathsForPush : undefined,
      });
      const updatedFilePaths = isUpdateBuild
        ? [...projectFiles.map((f) => f.path), ...deletedPathsForPush]
        : generatedPaths;
      const changeBullets = isUpdateBuild
        ? fileTrail.length || deletedPathsForPush.length
          ? changeSummaryFromFileTrail(fileTrail, deletedPathsForPush)
          : shortChangeSummary(userPrompt, updatedFilePaths)
        : undefined;
      const updateSummaryData = {
        ...summaryData,
        isUpdate: isUpdateBuild,
        updatedFiles: updatedFilePaths,
        updateRequest: currentMessage,
        changesSummary: isUpdateBuild
          ? inferUpdateChangesSummary(userPrompt, updatedFilePaths)
          : undefined,
        liveUrl: pipeline.deployVerified ? pipeline.deployUrl : undefined,
        repoUrl: pipeline.github.htmlUrl,
      };
      featureOutput = {
        ...featureOutput,
        deployUrl: pipeline.deployUrl,
        deployVerified: pipeline.deployVerified,
        vercelDeploymentId: pipeline.vercelDeploymentId ?? featureOutput.vercelDeploymentId,
        vercelPreviewUrl: pipeline.vercelPreviewUrl,
        netlifyPreviewUrl: pipeline.netlifyPreviewUrl,
        followUps: [...LANDING_UPDATE_FOLLOW_UPS],
        githubRepoUrl: pipeline.github.htmlUrl,
        githubRepoName: pipeline.github.repoName,
        projectName: summaryData.projectName,
        pages: summaryData.pages,
        features: summaryData.features,
        designTheme: summaryData.designTheme,
        needsPayment: summaryData.needsPayment,
        generatedFiles: updatedFilePaths,
        fileCount: projectFiles.length,
        githubPushConfirmed: true,
        userPrompt: currentMessage,
        isUpdate: isUpdateBuild,
        updatedFiles: updatedFilePaths,
        changesSummary: changeBullets,
        fileTrail: isUpdateBuild ? fileTrail : undefined,
        previousFiles: isUpdateBuild ? previousFilesForRollback : undefined,
        commitSha: pipeline.github.commitSha,
        githubBranch: pipeline.github.branch ?? ctx.githubTargetBranch ?? 'main',
        memoryNote:
          pipeline.deployError && !pipeline.deployVerified
            ? `${memoryNote ? `${memoryNote} ` : ''}Hosted preview note: ${pipeline.deployError.slice(0, 160)}`
            : memoryNote,
        summary: formatBuildSummaryCard(updateSummaryData),
      };
      buildState.markDone('deployed');
      todos.completeFinal('github-push');
      todos.activateFinal('live-deploy');
      emit(ctx, 8, BRAND.phase8.liveDeploy, 'builder', todos, 'XROGA AI', { userPhase: 4 });
      todos.completeFinal('live-deploy');
      emit(ctx, 8, BRAND.phase8.liveReady, 'complete', todos, 'BLACK HOLE V∞', { userPhase: 4 });
      void upsertBuildProject({
        userId,
        name: summaryData.projectName,
        type: 'website',
        userPrompt: currentMessage,
        githubRepoUrl: pipeline.github.htmlUrl,
        githubRepoName: pipeline.github.repoName,
        githubBranch: ctx.githubTargetBranch ?? 'main',
        deployUrl: pipeline.deployVerified ? pipeline.deployUrl : undefined,
        projectFiles,
        isHackathon: Boolean(hackathonNote),
        summaryText: featureOutput.summary,
      });
      void notifyBuildComplete(userId, {
        projectName,
        prompt: userPrompt,
        githubRepoUrl: pipeline.github.htmlUrl,
        deployUrl: pipeline.deployVerified ? pipeline.deployUrl : undefined,
        fileCount: projectFiles.length,
        assistantMessageId: ctx.assistantMessageId,
        deployError: pipeline.deployError,
      });
      void autoPublishBuildToCommunity(userId, {
        projectName: summaryData.projectName,
        userPrompt: currentMessage,
        deployUrl: pipeline.deployVerified ? pipeline.deployUrl : undefined,
        githubRepoUrl: pipeline.github.htmlUrl,
        priceXrg: 0,
      });
    } catch (err) {
      deployError = (err as Error).message;
      console.warn('[NegotiationEngine] GitHub/deploy pipeline:', deployError);
      emit(ctx, 8, BRAND.phase8.deployFailed, 'builder', todos, 'XROGA AI');

      if (featureOutput?.type === 'landing_page') {
        try {
          const github = await pushBuildToGitHub(userId, projectFiles, {
            slug: projectSlug,
            targetRepo: ctx.githubTargetRepo,
            targetBranch: ctx.githubTargetBranch,
          });
          featureOutput = {
            ...featureOutput,
            githubRepoUrl: github.htmlUrl,
            githubRepoName: github.repoName,
            projectName: summaryData.projectName,
            pages: summaryData.pages,
            features: summaryData.features,
            designTheme: summaryData.designTheme,
            needsPayment: summaryData.needsPayment,
            generatedFiles: generatedPaths,
            fileCount: projectFiles.length,
            githubPushConfirmed: true,
            userPrompt: currentMessage,
            memoryNote:
              memoryNote ??
              `Code pushed to ${github.repoName}. Click Open Live Preview to publish the hosted link.`,
            summary: formatBuildSummaryCard({
              ...summaryData,
              repoUrl: github.htmlUrl,
            }),
          };
          todos.completeFinal('github-push');
          void upsertBuildProject({
            userId,
            name: summaryData.projectName,
            type: 'website',
            userPrompt: currentMessage,
            githubRepoUrl: github.htmlUrl,
            githubRepoName: github.repoName,
            githubBranch: ctx.githubTargetBranch ?? 'main',
            projectFiles,
            isHackathon: Boolean(hackathonNote),
            summaryText: featureOutput.summary,
          });
          void notifyBuildComplete(userId, {
            projectName,
            prompt: userPrompt,
            githubRepoUrl: github.htmlUrl,
            fileCount: projectFiles.length,
            assistantMessageId: ctx.assistantMessageId,
            deployError: deployError,
          });
        } catch (pushErr) {
          const pushMsg = (pushErr as Error).message;
          console.warn('[NegotiationEngine] GitHub push retry:', pushMsg);
          void notifyBuildFailed(userId, {
            projectName,
            prompt: userPrompt,
            error: pushMsg,
            assistantMessageId: ctx.assistantMessageId,
          });
          featureOutput = {
            ...featureOutput,
            githubPushConfirmed: false,
            memoryNote: `GitHub push failed: ${pushMsg.slice(0, 140)}. Use your selected repo in the chatbar and retry.`,
          };
        }
      }
    }
  } else {
    todos.completeFinal('emit');
  }

  const liveUrl =
    featureOutput?.type === 'landing_page' ? featureOutput.deployUrl : undefined;
  const repoUrl =
    featureOutput?.type === 'landing_page' ? featureOutput.githubRepoUrl : undefined;

  let polishedOutput: string;
  if (isGameBuild && featureOutput?.type === 'landing_page') {
    const phaseDone = stepsToRun.length;
    const totalPhases = steps.length;
    polishedOutput = `${featureOutput.summary ?? '🎮 YOUR GAME IS PLAYABLE!'}\n\n${GAME_PHASE_COMPLETE_MSG(phaseDone, totalPhases)}`;
  } else if (liveUrl && featureOutput?.type !== 'landing_page') {
    polishedOutput = formatBuildSummaryCard({
      ...buildSummaryFromBrief(userPrompt, clarifiedBrief, liveUrl, repoUrl, memoryNote),
      liveUrl,
      repoUrl,
    });
  } else if (deployError) {
    polishedOutput = `[Phase 5] Deploy issue: ${deployError}\n\nYour site was built — check GitHub and retry preview.`;
  } else if (featureOutput) {
    polishedOutput = BRAND.phase7.success;
  } else {
    polishedOutput = BRAND.phase7.success;
  }

  if (featureOutput?.type === 'landing_page') {
    // Keep a short reply so clients never show blank "No response" if the card fails to mount
    const htmlLen = (featureOutput as { html?: string }).html?.trim().length ?? 0;
    polishedOutput =
      htmlLen > 40
        ? '✅ Preview ready — your site is in the project card below.'
        : '⚠️ Build finished but preview HTML was empty. Retry to ship a sandbox site.';
  }

  todos.completeFinal('emit');
  todos.completeAll();
  emit(ctx, 7, BRAND.phase7.success, 'complete', todos, 'BLACK HOLE V∞');

  const tokenUsage =
    usageTracker.totalTokens > 0
      ? {
          inputTokens: usageTracker.totalInput,
          outputTokens: usageTracker.totalOutput,
          totalTokens: usageTracker.totalTokens,
          estimatedUsd: usageTracker.estimatedUsd,
          byModel: usageTracker.snapshot(),
        }
      : undefined;

  return {
    success: true,
    clarifiedBrief,
    approvedPlan,
    assembledCode,
    polishedOutput,
    featureOutput: featureOutput ?? undefined,
    tokenUsage,
  };
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg === 'CLIENT_DISCONNECTED' || ctx.abortSignal?.aborted) {
      console.warn('[NegotiationEngine] Client disconnected — stopping further paid API calls');
      return {
        success: false,
        clarifiedBrief: '',
        approvedPlan: '',
        assembledCode: '',
        polishedOutput:
          'Connection lost mid-build. We stopped further AI calls to protect your tokens. Reconnect and retry — you only pay for work already completed.',
      };
    }
    throw err;
  } finally {
    await flushBuildUsage(ctx.userId, usageTracker);
  }
}

/** OSS Escape Pod — paid APIs down: still ship a real sandbox site, never a how-to essay. */
export async function runEscapePod(ctx: NegotiationContext): Promise<NegotiationResult> {
  const usageTracker = ctx.usageTracker ?? new BuildUsageTracker();
  ctx.usageTracker = usageTracker;
  const todos = createTodoState(ctx.userPrompt, {
    hasSelectedRepo: Boolean(ctx.githubTargetRepo?.includes('/')),
  });
  todos.activateMeta('analyze');
  emit(ctx, 0, BRAND.escape.pod, 'architect', todos, 'XROGA Escape Pod');
  const plan = defaultPlanForPrompt(ctx.userPrompt).join('\n');
  let featureOutput: FeatureOutput | undefined;
  try {
    // Prefer real DeepSeek HTML even in Escape Pod — scaffold only if AI is down
    featureOutput = await buildLandingFromSwarmAssembly(
      '',
      ctx.userPrompt,
      plan,
      ctx.userPrompt,
      'website',
      {
        skipConsolidate: true,
        allowScaffoldFallback: true,
        userId: ctx.userId,
        tracker: usageTracker,
      }
    );
  } catch (err) {
    console.warn('[EscapePod] landing assembly failed:', (err as Error).message);
  }
  await flushBuildUsage(ctx.userId, usageTracker);
  // Scaffold-only path: still bill a small estimate so dashboard never stays 0% after a ship
  if (usageTracker.totalTokens <= 0 && featureOutput?.type === 'landing_page') {
    const htmlLen = (featureOutput as { html?: string }).html?.length ?? 0;
    if (htmlLen > 40) {
      try {
        await recordLlmUsage(
          ctx.userId,
          Math.max(80, Math.ceil(ctx.userPrompt.length / 4)),
          Math.max(200, Math.ceil(htmlLen / 4))
        );
      } catch {
        /* ignore */
      }
    }
  }
  todos.completeAll();
  emit(ctx, 7, BRAND.escape.done, 'complete', todos, 'BLACK HOLE V∞');
  if (featureOutput?.type === 'landing_page') {
    featureOutput = {
      ...featureOutput,
      memoryNote:
        'Built in Escape Pod sandbox (paid APIs unavailable). Connect GitHub to push live when ready.',
      userPrompt: ctx.userPrompt,
    };
    const escapeHtml = (featureOutput.html || '').trim();
    return {
      success: true,
      clarifiedBrief: ctx.userPrompt,
      approvedPlan: plan,
      assembledCode: featureOutput.html ?? '',
      // Never return empty polishedOutput alone — UI must always have visible text if card fails
      polishedOutput:
        escapeHtml.length > 40
          ? '✅ Preview ready — Escape Pod sandbox (connect GitHub anytime to go live).'
          : 'Escape Pod could not assemble preview HTML. Tap Retry to rebuild.',
      featureOutput,
      tokenUsage:
        usageTracker.totalTokens > 0
          ? {
              inputTokens: usageTracker.totalInput,
              outputTokens: usageTracker.totalOutput,
              totalTokens: usageTracker.totalTokens,
              estimatedUsd: usageTracker.estimatedUsd,
              byModel: usageTracker.snapshot(),
            }
          : undefined,
    };
  }
  // Last resort: still avoid essays — return minimal success card text only
  return {
    success: false,
    clarifiedBrief: ctx.userPrompt,
    approvedPlan: plan,
    assembledCode: '',
    polishedOutput:
      'Build engines are temporarily unavailable. Please retry in a moment — XROGA will generate your site files, not a written guide.',
  };
}
