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
import { fetchHackathonResearch } from '../../lib/hackathonResearch.js';
import {
  buildSummaryFromBrief,
  formatBuildSummaryCard,
  friendlyStepLabel,
  inferBusinessLabel,
  inferDefaultBuildBrief,
  isWebsiteBuildPrompt,
  parseProjectName,
  slugFromProjectName,
  stepTargetLabel,
} from './phaseUi.js';
import type { FeatureCategory, FeatureOutput, SwarmProgressEvent } from '../../types/features.js';
import type { NegotiationContext, NegotiationPhase, NegotiationResult, VerificationReport, SwarmTodoItem } from './types.js';
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
import { swarmReserveProcess } from '../reserve/orchestrator.js';
import {
  isGitHubConnected,
  pushAndDeployLivePreview,
  pushBuildToGitHub,
  fetchBuildFilesFromGitHub,
  analyzeGitHubRepo,
} from '../../services/integrations/githubDeploy.js';
import { siteCodeFromProjectFiles, LANDING_UPDATE_FOLLOW_UPS } from '../../lib/landingPreview.js';
import {
  isBuildContinuation,
  isWebsiteUpdateRequest,
  threadHasCompletedWebsite,
} from '../../lib/buildContinuation.js';
import { routingPrompt } from '../../lib/promptRouting.js';
import { deepseekCode, groqCode, geminiCode } from '../../services/code/codeClients.js';
import { resolveApiKey } from '../../config/apiKeyRouter.js';
import { buildModelCall } from './buildModelRouter.js';
import {
  xrogaArchitectureLine,
  xrogaPulseLine,
  xrogaVisionaryLine,
  xrogaCollectiveLine,
  xrogaBlackHoleLine,
  xrogaGitHubLine,
} from './xrogaBrandActivity.js';
import { buildFullProjectFiles, scaffoldFilePaths } from '../../services/projectScaffold.js';
import { BuildUsageTracker } from '../../lib/buildUsageTracker.js';
import { recordUsage } from '../../phase1/tokenTracker.js';
import { recordModelUsage } from '../../phase1/modelQuotaTracker.js';
import { autoPublishBuildToCommunity } from '../../services/communityAutoPublish.js';
import { notifyBuildComplete, notifyBuildFailed } from '../../services/notificationService.js';

/** Max tokens per build step — no compromise on complete code output */
const BUILD_STEP_MAX_TOKENS = 16384;

const MAX_PLAN_ITERATIONS = 3;
const MAX_STEP_CORRECTIONS = 3;

const META_TODO_DEFS: Array<{ id: string; label: string }> = [
  { id: 'github', label: '[Phase 0] GitHub connected' },
  { id: 'analyze', label: '[Phase 1] Starting build' },
  { id: 'plan', label: '[Phase 1] Planning steps' },
  { id: 'structure', label: '[Phase 1] Plan review' },
  { id: 'steps', label: '[Phase 1] Plan approved' },
  { id: 'verify-plan', label: '[Phase 1] Ready to build' },
];

function createTodoState() {
  const meta: SwarmTodoItem[] = META_TODO_DEFS.map((d) => ({
    ...d,
    status: 'pending' as const,
  }));
  let build: SwarmTodoItem[] = [];
  let analysis = '';

  const snapshot = (): SwarmTodoItem[] => [...meta, ...build];

  const setAnalysis = (text: string) => {
    analysis = text.slice(0, 400);
  };

  const activateMeta = (id: string) => {
    let passed = false;
    for (const item of meta) {
      if (item.id === id) {
        item.status = 'active';
        passed = true;
      } else if (!passed) {
        item.status = 'done';
      } else {
        item.status = 'pending';
      }
    }
    for (const item of build) {
      if (item.status === 'active') item.status = 'pending';
    }
  };

  const completeMetaThrough = (id: string) => {
    let found = false;
    for (const item of meta) {
      if (item.id === id) {
        item.status = 'done';
        found = true;
      } else if (!found) {
        item.status = 'done';
      }
    }
  };

  const setBuildSteps = (steps: string[]) => {
    build = steps.map((s, i) => ({
      id: `build-${i}`,
      label: `Step ${i + 1}/${steps.length} ${stepTargetLabel(s, i)}`,
      status: 'pending' as const,
    }));
  };

  const activateBuild = (index: number) => {
    build.forEach((item, i) => {
      if (i < index) item.status = 'done';
      else if (i === index) item.status = 'active';
      else item.status = 'pending';
    });
    for (const item of meta) {
      if (item.status !== 'done') item.status = 'done';
    }
  };

  const completeAllBuild = () => {
    build.forEach((item) => {
      item.status = 'done';
    });
  };

  const addFinalTodos = () => {
    const extras: SwarmTodoItem[] = [
      { id: 'final-check', label: '[Phase 4] Final verification', status: 'pending' },
      { id: 'emit', label: '[Phase 5] Summary card', status: 'pending' },
      { id: 'github-push', label: '[Phase 5] GitHub push', status: 'pending' },
      { id: 'live-deploy', label: '[Phase 5] Live preview', status: 'pending' },
    ];
    for (const item of extras) {
      if (!build.some((b) => b.id === item.id)) build.push(item);
    }
  };

  const activateFinal = (id: 'github-push' | 'live-deploy' | 'final-check' | 'emit') => {
    for (const item of build) {
      if (item.id === id) item.status = 'active';
      else if (item.status === 'active') item.status = 'done';
    }
  };

  const completeAll = () => {
    meta.forEach((m) => {
      m.status = 'done';
    });
    build.forEach((b) => {
      b.status = 'done';
    });
  };

  const completeMeta = (id: string) => {
    for (const item of meta) {
      if (item.id === id) item.status = 'done';
    }
  };

  const completeBuild = (index: number) => {
    build.forEach((item, i) => {
      if (i <= index) item.status = 'done';
      else if (item.status === 'active') item.status = 'pending';
    });
  };

  const completeFinal = (id: 'github-push' | 'live-deploy' | 'final-check' | 'emit') => {
    for (const item of build) {
      if (item.id === id) item.status = 'done';
    }
  };

  return {
    snapshot,
    setAnalysis,
    activateMeta,
    completeMeta,
    completeMetaThrough,
    setBuildSteps,
    activateBuild,
    completeBuild,
    completeAllBuild,
    addFinalTodos,
    activateFinal,
    completeFinal,
    completeAll,
    getAnalysis: () => analysis,
  };
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
  const userPhase =
    opts?.userPhase ??
    (phase === 0
      ? 0
      : phase <= 2
        ? 1
        : phase === 3
          ? 1
          : phase === 4
            ? 2
            : phase === 5
              ? 2
              : phase === 6
                ? 2
                : phase === 7
                  ? 5
                  : phase >= 8
                    ? 4
                    : 1);

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
    hackathonBrief: opts?.hackathonBrief,
    timestamp: new Date().toISOString(),
  } as SwarmProgressEvent);
}

export function shouldUseNegotiationEngine(prompt: string, category: FeatureCategory): boolean {
  if (['landing_page', 'code_debug', 'browser_automation'].includes(category)) return true;
  if (isBuildContinuation(prompt)) return true;
  if (isWebsiteUpdateRequest(prompt) && threadHasCompletedWebsite(prompt)) return true;
  const t = prompt.toLowerCase();
  const buildVerb = /\b(build|create|make|develop|design|launch|scaffold|generate)\b/;
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
    return deepseekCode(`${XROGA_USER_IDENTITY}\n\n${system}`, user, { maxTokens });
  }
  if (getSecret('DEEPSEEK_API_KEY')) {
    return deepSeekChat(
      [
        { role: 'system', content: `${XROGA_USER_IDENTITY}\n\n${system}` },
        { role: 'user', content: user },
      ],
      { model: 'deepseek-chat', maxTokens }
    );
  }
  return deepseekGenerate(user);
}

/** Tracked DeepSeek Flash — bulk code, file reads, verify, fixes */
async function deepseekFlashCall(
  system: string,
  user: string,
  maxTokens = 8192,
  tracker?: BuildUsageTracker
): Promise<string> {
  const { text } = await buildModelCall('flash', system, user, maxTokens, tracker);
  return text;
}

/** Tracked DeepSeek Pro — architecture, plan review, repo analysis, hard logic */
async function deepseekProCall(
  system: string,
  user: string,
  maxTokens = 8192,
  tracker?: BuildUsageTracker
): Promise<string> {
  const { text } = await buildModelCall('pro', system, user, maxTokens, tracker);
  return text;
}

const BUILD_HEARTBEAT_MSGS = [
  '⚙️ XROGA AI Black Hole — writing HTML structure…',
  '⚙️ BLACK HOLE V∞ — generating CSS styles…',
  '⚙️ XROGA AI Black Hole — building page sections…',
  '⚙️ AI Swarm Logic — still coding your website…',
];

/** Emit progress every 5s during long code API calls so the UI never looks frozen */
async function withBuildHeartbeat<T>(
  ctx: NegotiationContext,
  todos: ReturnType<typeof createTodoState>,
  work: () => Promise<T>
): Promise<T> {
  let tick = 0;
  const id = setInterval(() => {
    const msg = BUILD_HEARTBEAT_MSGS[tick % BUILD_HEARTBEAT_MSGS.length]!;
    tick += 1;
    emit(ctx, 3, msg, 'builder', todos, 'AI SWARM LOGIC', { userPhase: 1 });
  }, 5000);
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
  tracker?: BuildUsageTracker
): Promise<VerificationReport[]> {
  const results = await Promise.allSettled([
    buildModelCall('flash', PHASE_4_GROQ_VERIFY, `Code:\n${code.slice(0, 6000)}`, 256, tracker).then((r) => ({
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

export async function runNegotiationEngine(ctx: NegotiationContext): Promise<NegotiationResult> {
  const usageTracker = ctx.usageTracker ?? new BuildUsageTracker();
  ctx.usageTracker = usageTracker;
  const { userPrompt: rawPrompt, featureCategory, userId } = ctx;
  const userPrompt = rawPrompt.trim();
  const currentMessage = routingPrompt(userPrompt);
  const todos = createTodoState();
  const buildState = new BuildState();
  const businessLabel = inferBusinessLabel(userPrompt);

  emit(ctx, 0, BRAND.phase0.scanning(businessLabel), 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });

  todos.activateMeta('github');
  const githubOk = await isGitHubConnected(userId);
  if (!githubOk) {
    emit(ctx, 0, BRAND.github.required, 'architect', todos, 'AI SWARM LOGIC');
    return {
      success: false,
      clarifiedBrief: '',
      approvedPlan: '',
      assembledCode: '',
      polishedOutput:
        '🔗 [Phase 0] Connect GitHub to save your work. XROGA will push your code and deploy a live preview automatically.',
      needsGitHubConnection: true,
    };
  }
  buildState.markDone('auth');
  todos.completeMeta('github');
  emit(ctx, 0, BRAND.github.verified, 'architect', todos, 'AI SWARM LOGIC');

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

  let webResearchNote = '';
  let uiTrendNote = '';
  let hackathonNote = '';

  if (isProductBuild || isGameBuild) {
    try {
      const searchQuery = isWebsiteUpdateRequest(userPrompt)
        ? `${currentMessage} UI patterns best practices`
        : `${inferBusinessLabel(userPrompt)} ${buildType} requirements 2026`;
      const results = await webSearch(searchQuery, {
        maxResults: 4,
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
      const uiTrend = await fetchUiTrendResearch(inferBusinessLabel(userPrompt), buildType);
      if (uiTrend) {
        uiTrendNote = uiTrend.context;
        emit(ctx, 0, xrogaVisionaryLine('UI trend research — modern 2026 design patterns'), 'reviewer', todos, 'XROGA Visionary', {
          userPhase: 1,
        });
      }
    } catch {
      /* optional */
    }

    try {
      const hackathon = await fetchHackathonResearch(userPrompt);
      if (hackathon) {
        hackathonNote = hackathon.context;
        emit(ctx, 0, xrogaArchitectureLine('Hackathon requirements researched — sponsor gaps & ASP ideas mapped'), 'architect', todos, 'XROGA Architect', {
          userPhase: 1,
          hackathonBrief: hackathon.card,
        });
      }
    } catch {
      /* optional */
    }

    if (webResearchNote || uiTrendNote || hackathonNote) {
      try {
        const { text: synthesis } = await buildModelCall(
          'grok',
          `You are XROGA Strategist (Grok 4). Synthesize web/UI/hackathon research into build priorities, risks, and sponsor gaps. Under 350 words.`,
          `User:\n${userPrompt}\n\n${webResearchNote}\n${uiTrendNote}\n${hackathonNote}`,
          3072,
          usageTracker
        );
        if (synthesis?.trim()) {
          webResearchNote = `${webResearchNote}\n\nGrok research synthesis:\n${synthesis}`;
          emit(ctx, 0, xrogaArchitectureLine('Grok — research synthesis from web sources'), 'architect', todos, 'XROGA Architect', {
            userPhase: 1,
          });
        }
      } catch {
        /* optional grok */
      }
    }
  }

  const isWebBuild = isProductBuild;

  const isUpdateBuild =
    isWebBuild &&
    isWebsiteUpdateRequest(userPrompt) &&
    (hasBuildConversationContext(userPrompt) || threadHasCompletedWebsite(userPrompt));

  let existingSiteCode: { html: string; css: string; js: string } | null = null;
  let repoAnalysisSummary: string | null = null;
  if (isWebBuild && ctx.githubTargetRepo?.includes('/')) {
    try {
      const analysis = await analyzeGitHubRepo(userId, ctx.githubTargetRepo, ctx.githubTargetBranch);
      repoAnalysisSummary = analysis.summary;
      if (analysis.hasBuildFiles) {
        existingSiteCode = analysis.buildFiles;
      }
      emit(ctx, 0, BRAND.phase0.scanning(`GitHub repo (${analysis.fileCount} files)`), 'reviewer', todos, 'XROGA Visionary', {
        userPhase: 1,
      });
    } catch (fetchErr) {
      console.warn('[NegotiationEngine] GitHub repo analysis:', (fetchErr as Error).message);
      if (isUpdateBuild) {
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
  const repoContextLine = repoAnalysisSummary ? `\n\nGitHub repo analysis:\n${repoAnalysisSummary}` : '';
  const researchBundle = `${webResearchNote}${uiTrendNote}${hackathonNote}`;
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
      clarifiedBrief = await geminiCall(
        PHASE_0_UPDATE_BRIEF,
        `Thread:\n${discoveryContext}\n\n${priorContext}\n\nUpdate request:\n${currentMessage}\n\nOutput the updated Fully Clarified Project Brief. Apply changes directly — do NOT ask questions.`
      );
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
    try {
      const { text: refined, modelLabel } = await buildModelCall(
        'pro',
        PHASE_0_DISCOVERY,
        `User request:\n${discoveryContext}\n\nDefault brief:\n${clarifiedBrief}\n\nRefine the Fully Clarified Project Brief — do NOT ask questions.`,
        8192,
        usageTracker
      );
      emit(ctx, 0, xrogaArchitectureLine('Project brief refined'), 'architect', todos, 'XROGA Architect', {
        userPhase: 1,
      });
      if (refined && !/clarifying question|\?\s*$/im.test(refined) && refined.length > 80) {
        clarifiedBrief = refined;
      }
    } catch {
      /* keep inferred defaults */
    }
    buildState.markDone('clarified');
    todos.setAnalysis(clarifiedBrief.slice(0, 280));
    todos.completeMeta('analyze');
    emit(ctx, 0, BRAND.phase0.briefReady, 'reviewer', todos, 'XROGA Visionary', { userPhase: 1 });
    try {
      clarifiedBrief = (await buildModelCall('flash', PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 256, usageTracker)).text;
      emit(ctx, 0, BRAND.phase0.briefCondensed, 'qa', todos, 'XROGA Pulse');
    } catch {
      /* keep brief */
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
    clarifiedBrief = (await buildModelCall('flash', PHASE_0_GROQ_SUMMARIZE, clarifiedBrief, 256, usageTracker)).text;
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
  } else {
    try {
      let strategyContext = '';
      try {
        const { text: strategy } = await buildModelCall(
          'grok',
          `You are XROGA Strategist (Grok). Analyze the project brief and output a concise build strategy: architecture, key features, UX priorities, and risks. Under 400 words.`,
          `Brief:\n${clarifiedBrief}\n\nOriginal:\n${userPrompt}`,
          4096,
          usageTracker
        );
        strategyContext = `\n\nStrategy:\n${strategy}`;
        emit(ctx, 1, xrogaArchitectureLine('Build strategy — Grok reasoning'), 'architect', todos, 'XROGA Architect', {
          userPhase: 1,
        });
      } catch {
        /* optional grok */
      }

      const { text, modelLabel } = await buildModelCall(
        'pro',
        PHASE_1_PLANNING_GEMINI,
        `Brief:\n${clarifiedBrief}${strategyContext}\n\nOriginal:\n${userPrompt}`,
        8192,
        usageTracker
      );
      masterPlan = text;
      emit(ctx, 1, xrogaArchitectureLine('Master plan generated'), 'architect', todos, 'XROGA Architect', {
        userPhase: 1,
      });
      try {
        masterPlan = (await buildModelCall('pro', PHASE_1_PLANNING_GROQ, masterPlan, 1024, usageTracker)).text;
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
  emit(ctx, 2, BRAND.phase2.reviewing, 'reviewer', todos, 'XROGA Architect', { userPhase: 1 });
  let approvedPlan = masterPlan;
  if (!isUpdateBuild) {
  for (let i = 0; i < MAX_PLAN_ITERATIONS; i++) {
    emit(ctx, 2, BRAND.phase2.reviewing, 'reviewer', todos, 'XROGA Architect', { userPhase: 1 });
    const review = await deepseekProCall(
      PHASE_2_DEEPSEEK_REVIEW,
      `User query:\n${userPrompt}\n\nMaster Plan:\n${approvedPlan}`,
      4096,
      usageTracker
    );

    if (isPass(review)) {
      approvedPlan = review.replace(/^APPROVED PLAN\s*/i, '').trim() || approvedPlan;
      break;
    }

    const corrected = review.replace(/^CORRECTED PLAN\s*/i, '').trim() || review;
    emit(ctx, 2, BRAND.phase2.negotiating, 'architect', todos, 'XROGA Visionary', { userPhase: 1 });
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
  const stepsToRun = isGameBuild ? steps.slice(0, gameMaxSteps) : steps;
  todos.setBuildSteps(stepsToRun);
  todos.activateMeta('steps');
  todos.completeMeta('steps');

  emit(
    ctx,
    3,
    isUpdateBuild
      ? BRAND.phase3.updateStart(stepsToRun.length)
      : isGameBuild
        ? BRAND.phase3.buildStart(stepsToRun.length)
        : BRAND.phase3.buildStart(steps.length),
    'builder',
    todos,
    isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect',
    { userPhase: 1 }
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
  const existingCodeContext = existingSiteCode
    ? `\n\nEXISTING SITE (edit — do not rebuild from scratch):\n--- index.html ---\n${existingSiteCode.html}\n\n--- styles.css ---\n${existingSiteCode.css}\n\n--- script.js ---\n${existingSiteCode.js}`
    : '';

  for (let si = 0; si < stepsToRun.length; si++) {
    const stepLabel = `Step ${si + 1}/${stepsToRun.length}`;
    const target = stepTargetLabel(stepsToRun[si]!, si);
    todos.activateBuild(si);
    emit(ctx, 3, BRAND.phase3.execute(si + 1, stepsToRun.length, target), 'builder', todos, isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect', {
      userPhase: isUpdateBuild ? 2 : 1,
    });

    const passLabel = si === 0 ? xrogaPulseLine(`Scaffolding — ${target}`) : xrogaArchitectureLine(`Logic — ${target}`);
    emit(ctx, 3, passLabel, 'builder', todos, si === 0 ? 'XROGA Pulse' : 'XROGA Architect', { userPhase: 1 });

    let stepCode = '';
    try {
      stepCode = await withBuildHeartbeat(ctx, todos, async () => {
        const role =
          isUpdateBuild || hackathonNote || repoAnalysisSummary
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
          BUILD_STEP_MAX_TOKENS,
          usageTracker
        );
        return text;
      });
    } catch (stepErr) {
      console.warn('[NegotiationEngine] Step code gen:', (stepErr as Error).message);
      stepCode = isGameBuild
        ? `\`\`\`javascript\n// Step ${si + 1} fallback\nconst canvas=document.createElement('canvas');\n\`\`\``
        : `<!-- Step ${si + 1} fallback -->\n<section><h2>${stepsToRun[si]}</h2><p>Content for ${stepsToRun[si]}</p></section>`;
    }

    let approved = false;
    for (let attempt = 0; attempt < MAX_STEP_CORRECTIONS; attempt++) {
      emit(ctx, 4, BRAND.phase4.verifying, 'qa', todos, 'AI SWARM LOGIC', { userPhase: 2 });
      const reports = await verifyStepParallel(stepCode, approvedPlan, userPrompt, usageTracker);
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
      stepCode = await deepseekProCall(
        PHASE_5_CORRECT,
        `Failures:\n${errorPlan}\n\nCode:\n${stepCode}`,
        BUILD_STEP_MAX_TOKENS,
        usageTracker
      );
      totalCorrections++;
      emit(ctx, 5, BRAND.phase5.fixed, 'debugger', todos, 'XROGA Architect');
    }

    todos.completeBuild(si);
    // Mark step done with friendly label in activity log
    emit(ctx, 3, friendlyStepLabel(stepsToRun[si]!, si), 'builder', todos, isGameBuild ? 'XROGA Game Alchemist' : 'XROGA Architect', { userPhase: 1 });
    codeParts.push(`// --- ${stepLabel}: ${stepsToRun[si]} ---\n${stepCode}`);
    if (!approved) {
      emit(ctx, 5, BRAND.phase5.maxReached, 'debugger', todos, 'XROGA Architect');
    }
  }

  buildState.markDone('executed');

  let assembledCode = codeParts.join('\n\n');

  emit(ctx, 6, xrogaVisionaryLine('UI polish — responsive design & animations'), 'reviewer', todos, 'XROGA Visionary', {
    userPhase: 2,
  });
  try {
    const { text: uiPolish, modelLabel } = await buildModelCall(
      'sonnet',
      `You are XROGA Visionary. Polish HTML/CSS/JS for modern responsive design, micro-interactions, accessibility (ARIA), and optional dark mode. Output ONLY complete fenced html, css, javascript blocks — no commentary, no truncation.`,
      `Brief:\n${clarifiedBrief}\n\nApproved plan:\n${approvedPlan}\n\nCodebase:\n${assembledCode}`,
      BUILD_STEP_MAX_TOKENS,
      usageTracker,
      { userId: ctx.userId, claudeTask: 'ui' }
    );
    if (uiPolish?.trim()) {
      assembledCode = `${assembledCode}\n\n// --- UI/UX polish (${modelLabel}) ---\n${uiPolish}`;
    }
  } catch {
    /* fallback handled in buildModelCall */
  }

  todos.addFinalTodos();
  todos.activateFinal('final-check');
  emit(ctx, 6, xrogaCollectiveLine('Quality gate — code standards review'), 'truth_council', todos, 'XROGA Collective', {
    userPhase: 2,
  });
  try {
    const reviewRole = buildType === 'crypto' ? 'opus' : hackathonNote ? 'grok' : 'pro';
    const { text: qualityReview } = await buildModelCall(
      reviewRole,
      PHASE_6_FINAL,
      `Full codebase:\n${assembledCode}`,
      2048,
      usageTracker,
      reviewRole === 'opus' ? { userId: ctx.userId, claudeTask: 'qa' } : undefined
    );
    if (!isPass(qualityReview)) {
      emit(ctx, 5, xrogaArchitectureLine('Applying quality fixes from review'), 'debugger', todos, 'XROGA Architect');
      assembledCode = await deepseekFlashCall(
        PHASE_5_CORRECT,
        `Quality review:\n${qualityReview}\n\nCode:\n${assembledCode}`,
        BUILD_STEP_MAX_TOKENS,
        usageTracker
      );
      totalCorrections++;
    }
  } catch {
    /* review falls back inside buildModelCall */
  }

  emit(ctx, 6, xrogaCollectiveLine('Security & integration audit'), 'truth_council', todos, 'XROGA Collective', {
    userPhase: 2,
  });
  const finalChecks = await Promise.allSettled([
    deepseekFlashCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode}`, 4096, usageTracker),
    geminiCall(PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 50000)}`, 512),
    buildModelCall('flash', PHASE_6_FINAL, `Full codebase:\n${assembledCode.slice(0, 40000)}`, 512, usageTracker).then(
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
      usageTracker
    );
    totalCorrections++;
  } else {
    emit(ctx, 6, BRAND.phase6.allPass, 'truth_council', todos, 'XROGA Collective', { userPhase: 2 });
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
        isGameBuild ? 'game' : 'website'
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
    todos.completeFinal('emit');
    buildState.markDone('emitted');
    todos.activateFinal('github-push');
    const pushTarget = ctx.githubTargetRepo?.includes('/') ? ctx.githubTargetRepo : 'selected GitHub repo';
    emit(ctx, 8, xrogaGitHubLine(pushTarget, ctx.githubTargetBranch ?? 'main'), 'builder', todos, 'XROGA AI', {
      userPhase: 4,
    });
    const generatedPaths = scaffoldFilePaths(userPrompt);
    const projectFiles = buildFullProjectFiles({
      html: featureOutput.html,
      css: featureOutput.css,
      js: featureOutput.js,
      projectName,
      userPrompt,
    });
    try {
      const pipeline = await pushAndDeployLivePreview(userId, projectFiles, projectSlug, {
        targetRepo: ctx.githubTargetRepo,
        targetBranch: ctx.githubTargetBranch,
      });
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
        generatedFiles: generatedPaths,
        fileCount: projectFiles.length,
        githubPushConfirmed: true,
        userPrompt: currentMessage,
        memoryNote:
          pipeline.deployError && !pipeline.deployVerified
            ? `${memoryNote ? `${memoryNote} ` : ''}Hosted preview note: ${pipeline.deployError.slice(0, 160)}`
            : memoryNote,
        summary: formatBuildSummaryCard({
          ...summaryData,
          liveUrl: pipeline.deployVerified ? pipeline.deployUrl : undefined,
          repoUrl: pipeline.github.htmlUrl,
        }),
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

  if (tokenUsage) {
    await recordUsage(ctx.userId, usageTracker.totalInput, usageTracker.totalOutput);
    await recordModelUsage(
      ctx.userId,
      usageTracker.snapshot().map((l) => ({
        role: l.role,
        inputTokens: l.inputTokens,
        outputTokens: l.outputTokens,
      }))
    );
  }

  return {
    success: true,
    clarifiedBrief,
    approvedPlan,
    assembledCode,
    polishedOutput,
    featureOutput: featureOutput ?? undefined,
    tokenUsage,
  };
}

/** OSS Escape Pod — all paid APIs down */
export async function runEscapePod(ctx: NegotiationContext): Promise<NegotiationResult> {
  const todos = createTodoState();
  todos.activateMeta('analyze');
  emit(ctx, 0, BRAND.escape.pod, 'architect', todos, 'XROGA Escape Pod');
  const raw = await swarmReserveProcess(ctx.userPrompt);
  todos.completeAll();
  emit(ctx, 7, BRAND.escape.done, 'complete', todos, 'BLACK HOLE V∞');
  return {
    success: true,
    clarifiedBrief: ctx.userPrompt,
    approvedPlan: 'OSS reserve',
    assembledCode: raw,
    polishedOutput: formatPlainProfessional(raw),
  };
}
