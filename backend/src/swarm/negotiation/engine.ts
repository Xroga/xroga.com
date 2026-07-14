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
  formatFilesForUpdateContext,
  landingOutputToPatchedFiles,
  mergePatchedFiles,
  planIncrementalUpdate,
  isForcedFullRepoFix,
  type UpdateTargetPlan,
} from '../../lib/incrementalUpdate.js';
import { siteCodeFromProjectFiles, LANDING_UPDATE_FOLLOW_UPS } from '../../lib/landingPreview.js';
import {
  isBuildContinuation,
  isWebsiteUpdateRequest,
  threadHasCompletedWebsite,
} from '../../lib/buildContinuation.js';
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
import { costAwareRole, policyForPrompt, strategyGrokVariant } from '../../lib/buildCostPolicy.js';

/** Max tokens per build step — no compromise on complete code output */
const BUILD_STEP_MAX_TOKENS = 16384;
const SIMPLE_BUILD_STEP_MAX_TOKENS = 8192;

const MAX_PLAN_ITERATIONS = 3;
const MAX_STEP_CORRECTIONS = 3;
const SIMPLE_MAX_PLAN_ITERATIONS = 0; // skip plan review entirely
const SIMPLE_MAX_STEP_CORRECTIONS = 0; // ship first Flash draft
const SIMPLE_MAX_STEPS = 1; // one-shot complete site

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
  opts?: { silent?: boolean; userPhase?: number; hackathonBrief?: import('../../phase1/types.js').HackathonBriefCard }
): void {
  assertNotAborted(ctx);
  // Keep userFacingPhase aligned with negotiationPhase so any consumer advances.
  const userPhase = opts?.userPhase ?? phase;

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

async function geminiCall(system: string, user: string, maxTokens = 2048): Promise<string> {
  try {
    if (resolveApiKey('gemini', 'code')) {
      return geminiCode(`${XROGA_USER_IDENTITY}\n\n${system}`, user, { maxTokens });
    }
    if (getSecret('GEMINI_API_KEY')) {
      return geminiGenerate(`${XROGA_USER_IDENTITY}\n\n${system}`, user, {
        model: 'gemini-2.0-flash',
        maxTokens,
      });
    }
    return geminiGenerateCultural(user);
  } catch {
    return deepseekCall(system, user, maxTokens);
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

async function deepseekCall(system: string, user: string, maxTokens = 8192): Promise<string> {
  if (resolveApiKey('deepseek', 'code')) {
    return deepseekCode(`${XROGA_USER_IDENTITY}\n\n${system}`, user, {
      maxTokens,
      model: XROGA_MODELS.deepseek_flash.apiModel,
    });
  }
  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${system}` },
        { role: 'user', content: user },
      ],
      { model: XROGA_MODELS.deepseek_flash.apiModel, maxTokens }
    );
  }
  return deepseekGenerate(user);
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

const BUILD_HEARTBEAT_MSGS = [
  '⚙️ Still writing code — this step is in progress…',
  '⚙️ Generating page sections…',
  '⚙️ Applying styles & layout…',
  '⚙️ AI Swarm Logic — coding step still running…',
];

/** Keepalive so build UI stays visible during long Flash generation (honest status, no fake files). */
async function withBuildHeartbeat<T>(
  ctx: NegotiationContext,
  todos: ReturnType<typeof createTodoState>,
  work: () => Promise<T>
): Promise<T> {
  let tick = 0;
  const id = setInterval(() => {
    const msg = BUILD_HEARTBEAT_MSGS[tick % BUILD_HEARTBEAT_MSGS.length]!;
    tick += 1;
    emit(ctx, 3, msg, 'builder', todos, 'XROGA Pulse');
  }, 4000);
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
    geminiCall(PHASE_4_GEMINI_VERIFY, `Plan:\n${plan.slice(0, 1500)}\n\nUser: ${prompt.slice(0, 300)}\n\nCode:\n${code.slice(0, 6000)}`, 256).then(
      (r) => ({ agent: 'gemini' as const, pass: isPass(r), report: r })
    ),
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

async function flushBuildUsage(userId: string, usageTracker: BuildUsageTracker): Promise<void> {
  if (usageTracker.totalInput + usageTracker.totalOutput <= 0) return;
  await recordLlmUsage(
    userId,
    usageTracker.totalInput,
    usageTracker.totalOutput,
    usageTracker.snapshot().map((l) => ({
      role: l.role,
      inputTokens: l.inputTokens,
      outputTokens: l.outputTokens,
    }))
  );
}

export async function runNegotiationEngine(ctx: NegotiationContext): Promise<NegotiationResult> {
  const usageTracker = ctx.usageTracker ?? new BuildUsageTracker();
  ctx.usageTracker = usageTracker;

  try {
  const { userPrompt: rawPrompt, featureCategory, userId } = ctx;
  const userPrompt = rawPrompt.trim();
  const costPolicy = policyForPrompt(userPrompt);
  console.info('[NegotiationEngine] costPolicy', {
    tier: costPolicy.tier,
    allowGrokStrategy: costPolicy.allowGrokStrategy,
    allowGrok45: costPolicy.allowGrok45,
    maxGrok45Calls: costPolicy.maxGrok45Calls,
    allowGrokReviewLoop: costPolicy.allowGrokReviewLoop,
    allowWebResearch: costPolicy.allowWebResearch,
  });
  const currentMessage = routingPrompt(userPrompt);
  const todos = createTodoState(userPrompt);
  const buildState = new BuildState();
  const businessLabel = inferBusinessLabel(userPrompt);

  emit(ctx, 0, BRAND.phase0.scanning(businessLabel), 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });

  todos.activateMeta('github');
  // Soft gate: always BUILD the site first. GitHub is optional deploy — never brick the user with a chat wall.
  const githubConnected = await isGitHubConnected(userId);
  if (!githubConnected) {
    emit(
      ctx,
      0,
      xrogaArchitectureLine('GitHub not connected — building sandbox preview first; connect later to push live'),
      'architect',
      todos,
      'XROGA Architect',
      { userPhase: 1 }
    );
    todos.completeMeta('github');
  } else {
    buildState.markDone('auth');
    todos.completeMeta('github');
    emit(ctx, 0, BRAND.github.verified, 'architect', todos, 'AI SWARM LOGIC');
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

  const isUpdateBuild =
    isProductBuild &&
    isWebsiteUpdateRequest(userPrompt) &&
    (hasBuildConversationContext(userPrompt) || threadHasCompletedWebsite(userPrompt));

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
          usageTracker
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
  if (isWebBuild && ctx.githubTargetRepo?.includes('/')) {
    try {
      const analysis = await analyzeGitHubRepo(userId, ctx.githubTargetRepo, ctx.githubTargetBranch);
      repoAnalysisSummary = analysis.summary;
      if (isUpdateBuild) {
        incrementalPlan = planIncrementalUpdate(
          userPrompt,
          analysis.treeSample.map((f) => f.path)
        );
        emit(
          ctx,
          0,
          xrogaPulseLine(
            `Incremental update — ${incrementalPlan.filePaths.size} file(s) only (cached repo, no full re-read)`
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
        if (targetedUpdateFiles.length) {
          existingSiteCode = siteCodeFromProjectFiles(targetedUpdateFiles);
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
  let repoContextLine = repoAnalysisSummary ? `\n\nGitHub repo analysis:\n${repoAnalysisSummary}${criticalRepoFilesNote}` : criticalRepoFilesNote;
  const researchBundle = `${webResearchNote}${uiTrendNote}${hackathonNote}${aiEndpointNote ? `\n\n${aiEndpointNote}` : ''}`;
  const discoveryContext = userPrompt.includes('[Previous conversation')
    ? `${userPrompt}${repoContextLine}${researchBundle}`
    : `${userPrompt}${repoContextLine}${researchBundle}\n\nOriginal build request context preserved.`;

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
          usageTracker
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
          usageTracker
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
        clarifiedBrief = (await buildModelCall('flash', PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 256, usageTracker, { userId })).text;
        emit(ctx, 0, BRAND.phase0.briefCondensed, 'qa', todos, 'XROGA Pulse');
      } catch {
        /* keep brief */
      }
    }
  } else if (isGameBuild) {
    emit(ctx, 0, BRAND.phase0.scanning('game'), 'reviewer', todos, 'XROGA Game Alchemist', { userPhase: 1 });
    try {
      clarifiedBrief = await geminiCall(
        PHASE_0_GAME_DISCOVERY,
        `User request:\n${discoveryContext}\n\nOutput Dream Game brief — do NOT write code yet.`
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
      `User request (full thread):\n${discoveryContext}\n\nCurrent answer:\n${currentMessage}\n\nPrior analysis: ${analysis.intentLabel}\n\nOutput the Fully Clarified Project Brief now — do NOT ask more questions. Match the user's niche from the thread.`
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
    clarifiedBrief = (await buildModelCall('flash', PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 256, usageTracker, { userId })).text;
      emit(ctx, 0, BRAND.phase0.briefCondensed, 'qa', todos, 'XROGA Pulse');
  } catch {
    /* keep gemini brief */
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
        usageTracker
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
    emit(ctx, 1, xrogaArchitectureLine('Fast plan ready — building blog now'), 'architect', todos, 'XROGA Architect');
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
            usageTracker
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
        usageTracker
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
  const planIterations =
    costPolicy.tier === 'simple_static' ? SIMPLE_MAX_PLAN_ITERATIONS : MAX_PLAN_ITERATIONS;
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
      `Original user:\n${userPrompt}\n\nCorrected plan:\n${corrected}`
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
  if (costPolicy.tier === 'simple_static') {
    stepsToRun = steps.slice(0, SIMPLE_MAX_STEPS);
  }
  if (isUpdateBuild && incrementalPlan) {
    stepsToRun = incrementalPlan.labels.slice(0, incrementalPlan.stepCount);
  }
  todos.setBuildSteps(stepsToRun);
  todos.activateMeta('steps');
  todos.completeMeta('steps');

  const stepTokenBudget =
    costPolicy.tier === 'simple_static' ? SIMPLE_BUILD_STEP_MAX_TOKENS : BUILD_STEP_MAX_TOKENS;
  const stepCorrectionsMax =
    costPolicy.tier === 'simple_static' ? SIMPLE_MAX_STEP_CORRECTIONS : MAX_STEP_CORRECTIONS;
  const lightVerify = isUpdateBuild || costPolicy.tier === 'simple_static';

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
      ? 'plain HTML/CSS/JS only. Edit existing files from GitHub. Output ONLY fenced code blocks.'
      : 'plain HTML/CSS/JS only. Output ONLY fenced code blocks. No explanations.';
  const existingCodeContext = targetedUpdateFiles.length
    ? `\n\n${formatFilesForUpdateContext(targetedUpdateFiles)}`
    : existingSiteCode
      ? `\n\nEXISTING SITE (edit — do not rebuild from scratch):\n--- index.html ---\n${existingSiteCode.html}\n\n--- styles.css ---\n${existingSiteCode.css}\n\n--- script.js ---\n${existingSiteCode.js}`
      : '';

  for (let si = 0; si < stepsToRun.length; si++) {
    const stepLabel = `Step ${si + 1}/${stepsToRun.length}`;
    const target = stepTargetLabel(stepsToRun[si]!, si);
    todos.activateBuild(si);
    todos.advanceCodeStep(si, stepsToRun.length, target);
    emit(ctx, 3, BRAND.phase3.execute(si + 1, stepsToRun.length, target), 'builder', todos, isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect');

    const passLabel = si === 0 ? xrogaPulseLine(`Scaffolding — ${target}`) : xrogaArchitectureLine(`Logic — ${target}`);
    emit(ctx, 3, passLabel, 'builder', todos, si === 0 ? 'XROGA Pulse' : 'XROGA Architect');

    let stepCode = '';
    try {
      stepCode = await withBuildHeartbeat(ctx, todos, async () => {
        const role =
          costPolicy.tier === 'simple_static'
            ? 'flash'
            : isUpdateBuild
              ? 'flash'
              : hackathonNote || repoAnalysisSummary
                ? si % 2 === 0
                  ? 'pro'
                  : 'flash'
                : si === 0
                  ? 'flash'
                  : si % 2 === 0
                    ? 'pro'
                    : 'flash';
        const { text } = await buildModelCall(
          role,
          executePrompt,
          `Approved Plan:\n${approvedPlan}\n\nExecute now: Step ${si + 1} — ${stepsToRun[si]}\n\nUser:\n${userPrompt}\n\nTech: ${executeTech}${existingCodeContext}`,
          stepTokenBudget,
          usageTracker,
          { userId }
        );
        return text;
      });
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
        const retry = await buildModelCall(
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

    let approved = costPolicy.tier === 'simple_static';
    for (let attempt = 0; attempt < stepCorrectionsMax; attempt++) {
      emit(ctx, 4, BRAND.phase4.verifying, 'qa', todos, 'AI SWARM LOGIC');
      const reports = await verifyStepParallel(stepCode, approvedPlan, userPrompt, usageTracker, lightVerify, userId);
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

  if (!isUpdateBuild && costPolicy.tier !== 'simple_static') {
    emit(ctx, 6, xrogaPulseLine('First-build preflight — runtime & UI sanity check'), 'qa', todos, 'XROGA Pulse');
    try {
      const { text: preflight } = await buildModelCall(
        'flash',
        `You are XROGA QA. Check HTML/CSS/JS for broken buttons, dead links, placeholder-only sections, missing event handlers, and mobile layout gaps. If issues found, return corrected fenced html/css/js blocks. If OK, reply PASS only.`,
        `User request:\n${userPrompt.slice(0, 800)}\n\nCode:\n${assembledCode.slice(0, 50000)}`,
        8192,
        usageTracker
      );
      if (preflight && !isPass(preflight) && /```/.test(preflight)) {
        assembledCode = `${assembledCode}\n\n// --- First-build preflight fixes ---\n${preflight}`;
      }
    } catch {
      /* optional preflight */
    }
  }

  emit(ctx, 6, xrogaVisionaryLine('UI polish — responsive design & animations'), 'reviewer', todos, 'XROGA Visionary');
  if (isUpdateBuild && incrementalPlan?.touchesUi && incrementalPlan.stepCount > 1) {
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
  } else if (!isUpdateBuild && costPolicy.tier !== 'simple_static') {
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
      `Brief:\n${clarifiedBrief}\n\nApproved plan:\n${approvedPlan}\n\nCodebase:\n${assembledCode}`,
      stepTokenBudget,
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

  if (!isUpdateBuild && costPolicy.allowGrokReviewLoop) {
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
  // Simple blogs: skip quality LLM pass — one-shot Flash already shipped (speed > perfect polish).
  if (costPolicy.tier === 'simple_static') {
    emit(ctx, 6, xrogaCollectiveLine('Fast path — quality check skipped for speed'), 'truth_council', todos, 'XROGA Collective', {
      silent: true,
    });
    emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective');
  } else {
  emit(ctx, 6, xrogaCollectiveLine('Quality gate — code standards review'), 'truth_council', todos, 'XROGA Collective');
  try {
    const reviewRole = costAwareRole(
      buildType === 'crypto' ? 'opus' : hackathonNote && costPolicy.allowGrokStrategy ? 'grok' : 'pro',
      costPolicy
    );
    const { text: qualityReview } = await buildModelCall(
      reviewRole,
      PHASE_6_FINAL,
      `Full codebase:\n${assembledCode}`,
      2048,
      usageTracker,
      reviewRole === 'opus'
        ? { userId: ctx.userId, claudeTask: 'qa' }
        : reviewRole === 'grok'
          ? { grokVariant: 'reasoning' }
          : undefined
    );
    if (!isPass(qualityReview)) {
      emit(ctx, 5, xrogaArchitectureLine('Applying quality fixes from review'), 'debugger', todos, 'XROGA Architect');
      assembledCode = await deepseekFlashCall(
        PHASE_5_CORRECT,
        `Quality review:\n${qualityReview}\n\nCode:\n${assembledCode}`,
        BUILD_STEP_MAX_TOKENS,
        usageTracker, userId
      );
      totalCorrections++;
    }
  } catch {
    /* review falls back inside buildModelCall */
  }

  emit(ctx, 6, xrogaCollectiveLine('Security & integration audit'), 'truth_council', todos, 'XROGA Collective');
  const finalChecks = await Promise.allSettled([
    deepseekFlashCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode}`, 4096, usageTracker, userId),
    geminiCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 50000)}`, 512),
    buildModelCall('flash', PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 40000)}`, 512, usageTracker, { userId }).then(
      (r) => r.text
    ),
    getSecret('MISTRAL_API_KEY')
      ? mistralChat(PHASE_6_FINAL, assembledCode.slice(0, 40000), { maxTokens: 512 })
      : Promise.resolve('PASS'),
  ]);

  const finalFail = finalChecks.some((r) => r.status === 'fulfilled' && !isPass(r.value as string));
  if (finalFail) {
    emit(ctx, 5, BRAND.phase5.correcting, 'debugger', todos, 'XROGA Architect');
    assembledCode = await deepseekFlashCall(
      PHASE_5_CORRECT,
      `Final review issues\n\n${assembledCode}`,
      BUILD_STEP_MAX_TOKENS,
      usageTracker, userId
    );
    totalCorrections++;
  } else {
    emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective');
  }
  }
  } else {
    emit(ctx, 6, xrogaPulseLine('Update verify — flash check on touched files only'), 'qa', todos, 'XROGA Pulse', {
      userPhase: 2,
    });
    try {
      const { text: quickCheck } = await buildModelCall(
        'flash',
        PHASE_6_FINAL,
        `Touched files only:\n${assembledCode.slice(0, 12000)}`,
        256,
        usageTracker
      );
      if (!isPass(quickCheck)) {
        assembledCode = await deepseekFlashCall(
          PHASE_5_CORRECT,
          `Quick review:\n${quickCheck}\n\nCode:\n${assembledCode}`,
          4096,
          usageTracker, userId
        );
        totalCorrections++;
      }
    } catch {
      /* skip heavy final audit on updates */
    }
  }
  buildState.markDone('verified');
  todos.completeFinal('final-check');

  if (shouldUseReserve(userPrompt, totalCorrections)) {
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

  try {
    if (isWebBuildFinal) {
      featureOutput = await buildLandingFromSwarmAssembly(
        assembledCode,
        userPrompt,
        approvedPlan,
        clarifiedBrief,
        isGameBuild ? 'game' : 'website',
        { skipConsolidate: isUpdateBuild || costPolicy.tier === 'simple_static' }
      );
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

  const projectName = parseProjectName(userPrompt, clarifiedBrief);
  const projectSlug = slugFromProjectName(projectName);
  const summaryData = buildSummaryFromBrief(userPrompt, clarifiedBrief, undefined, undefined, memoryNote);

  if (featureOutput?.type === 'landing_page') {
    featureOutput = {
      ...featureOutput,
      integratedAi: integratedAiSummaryForPrompt(userPrompt),
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
    if (isUpdateBuild && targetedUpdateFiles.length && updatePaths.size) {
      const fromAssembly = extractPatchedFilesFromAssembly(assembledCode, updatePaths);
      const fromLanding = landingOutputToPatchedFiles(
        featureOutput.html,
        featureOutput.css,
        featureOutput.js,
        updatePaths
      );
      const patched = mergePatchedFiles(targetedUpdateFiles, [...fromAssembly, ...fromLanding]);
      projectFiles = patched.filter((f) => updatePaths.has(f.path));
      emit(ctx, 8, xrogaGitHubLine(`patch ${projectFiles.length} file(s) only`, ctx.githubTargetBranch ?? 'main'), 'builder', todos, 'XROGA AI', {
        userPhase: 4,
      });
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
      featureOutput = {
        ...featureOutput,
        projectName: summaryData.projectName,
        pages: summaryData.pages,
        features: summaryData.features,
        designTheme: summaryData.designTheme,
        needsPayment: summaryData.needsPayment,
        generatedFiles: generatedPaths,
        fileCount: projectFiles.length,
        githubPushConfirmed: false,
        userPrompt: currentMessage,
        followUps: ['Connect GitHub to push & deploy', ...LANDING_UPDATE_FOLLOW_UPS.slice(0, 3)],
        memoryNote:
          'Your site is ready in sandbox preview. Connect GitHub under Integrations to push and get a live URL.',
        summary: formatBuildSummaryCard({
          ...summaryData,
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
      });
      const updatedFilePaths = isUpdateBuild
        ? [...(incrementalPlan?.filePaths ?? projectFiles.map((f) => f.path))]
        : generatedPaths;
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
    polishedOutput = '';
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
  const todos = createTodoState(ctx.userPrompt);
  todos.activateMeta('analyze');
  emit(ctx, 0, BRAND.escape.pod, 'architect', todos, 'XROGA Escape Pod');
  const plan = defaultPlanForPrompt(ctx.userPrompt).join('\n');
  let featureOutput: FeatureOutput | undefined;
  try {
    // Prefer assembler/template landing page — Escape Pod must never return chat essays.
    featureOutput = await buildLandingFromSwarmAssembly(
      '',
      ctx.userPrompt,
      plan,
      ctx.userPrompt,
      'website',
      { skipConsolidate: true }
    );
  } catch (err) {
    console.warn('[EscapePod] landing assembly failed:', (err as Error).message);
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
    return {
      success: true,
      clarifiedBrief: ctx.userPrompt,
      approvedPlan: plan,
      assembledCode: featureOutput.html ?? '',
      polishedOutput: '',
      featureOutput,
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
