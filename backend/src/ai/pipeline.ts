import { randomUUID } from 'crypto';
import { convertUserRequest } from './converter.js';
import { BLACK_HOLE_PUBLIC_NAME } from './black-hole/publicIdentity.js';
import { readCutoverPlan } from './black-hole/cutover.js';
import { buildEngineeringArtifact } from './engineeringArtifact.js';
import {
  researchThroughBlackHole,
  selectBuildModel,
  selectRepairModel as selectRepairModelThroughBlackHole,
} from './black-hole/productionBridge.js';
import { decideConversion } from './black-hole/converterPolicy.js';
import { analyzeTask } from './black-hole/taskClass.js';
import { assessBlackHoleComplexity } from './black-hole/complexity.js';
import { MODELS, type ModelId } from './models.js';
import {
  buildVisionUserContent,
  chatCompletionStream,
  estimateMessageTokens,
  type ChatMessage,
  type ChatResult,
} from './openaiCompat.js';
import { requireBuildArtifacts } from './buildOutputValidation.js';
import { selectShipBlockerMessage } from './compileBlockerMessage.js';
import { describeVercelDeployFailure, isVercelAuthFailure } from '../lib/vercelAuthError.js';
import {
  classifyValidation,
  describeUnverifiedShip,
  qaWasUnavailable,
} from './validationVerdict.js';
import {
  classifyBuilderFailure,
  isRetryableBuilderFailure,
  runBuilderAttempt,
  type BuilderAttemptBudget,
  type BuilderAttemptRecord,
} from './builderAttempt.js';
import { withProviderReservation } from './providerBudget.js';
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
import { completeRun, createRunDurable, failRun } from './runStore.js';
import { authorizeLegacyBuild } from './legacyBuilderAdapter.js';
import { startupProgress } from './startupProgress.js';
import {
  blueprintBriefForBuilder,
  describeBlueprintGaps,
  detectProductBlueprint,
  missingBlueprintSections,
} from '../synthesis/productBlueprints.js';
import {
  BuildStreamNarrator,
  narrationLine,
  type NarrationEvent,
} from './buildStreamNarrator.js';
import { heartbeatMessage, withProgressHeartbeat } from './progressHeartbeat.js';
import {
  UPDATE_HYDRATE_PATHS,
  fetchBuildFilesFromGitHub,
  fetchGitHubFilesByPaths,
  landingFilesFromOutput,
  pushBuildToGitHub,
  describeGitHubWriteFailure,
  deployToAllPlatforms,
  isGitHubConnected,
  getGithubDefaultRepo,
  inspectConnectedRepositoryState,
} from '../services/integrations/githubDeploy.js';
import { clearVercelConnection, getVercelToken } from '../services/integrations/vercelAuth.js';
import {
  getUserSupabaseStatus,
  buildProviderEnvFiles,
  getUserProviderKey,
} from '../services/integrations/userProviderKeys.js';
import {
  applyDeterministicStaticUpdate,
  buildScaffoldForPrompt,
  detectScaffoldKind,
  isSimpleStaticBuildPrompt,
  mergeScaffoldWithGenerated,
} from '../services/projectScaffold.js';
import {
  describeShadowObservation,
  observeUniversalShadow,
} from '../synthesis/universalShadow.js';
import { refusingCommit, tryUniversalBuild } from '../synthesis/universalEntrypoint.js';
import { routeProject } from '../config/universalAgentFlags.js';
import { findProjectIdByRepo } from '../services/memory/buildProjectStore.js';
import { atomicGitHubCommit, type UniversalCommitRecord } from '../synthesis/universalCommit.js';
import { getGitHubToken } from '../services/integrations/githubAuth.js';
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
  setProjectMemory,
  setProjectMemoryDurable,
  shouldGenerateAiSummary,
} from './projectMemory.js';
import { summarizeRepoForUpdates } from './repoSummarize.js';
import { scanProjectFiles, redactCriticalSecrets } from './securityScan.js';
import { pruneUnusedEmptyAssets, staticValidateProject } from './staticValidate.js';
import {
  compileValidateProject,
  productionValidationAllowsDeployment,
  validationFailureNeedsCodeRepair,
} from './compileValidate.js';
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
import { planGitHubShipping } from './githubShippingPlan.js';
import {
  createEvidence,
  redactSecrets,
  type OperationEvidence,
} from '../lib/truthfulExecution.js';
import {
  fallbackOrderForModel,
  createIntelligentRoutePlan,
  selectRepairModel as legacySelectRepairModel,
} from './intelligentRouter.js';
import { normalizeProviderError, recordModelValidation } from './providerRuntime.js';
import { classifyFailure } from '../lib/recoveryPlanner.js';
import { explicitlyDisablesResearch } from '../lib/taskClassifier.js';
import { loadRoutingOutcomes, recordRoutingOutcome } from './routingOutcomes.js';
import { getRuntimeModelRegistry } from './modelCapabilityRegistry.js';
import { prepareFocusedContext } from './contextPreparation.js';
import {
  ExecutionScheduler,
  InMemoryExecutionStateStore,
  SupabaseExecutionStateStore,
  executableTasksFromRoutePlan,
  transitionTask,
} from './executionRuntime.js';
import { describeVerificationState } from './verificationLifecycle.js';
import { engineeringTaskHandlers } from './engineeringTasks.js';
import { runUniversalSynthesisFoundation } from '../synthesis/foundation.js';

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
  /** True when this run took the universal engineering path rather than the legacy one. */
  universalPath?: boolean;
  /** True when the universal planner ran for comparison only and wrote nothing. */
  universalShadow?: boolean;
  /** `routeProject`'s stated reason for the path this run took. */
  universalReason?: string;
  /** True when the project id came from the client rather than repository resolution. */
  projectIdFromClient?: boolean;
  /**
   * Whether a project id reached the pipeline at all.
   *
   * Separate from the reason because it is the first thing to check when an allowlist
   * does not match: an id that never arrived and an id that is not allowlisted produce
   * the same legacy build, and only this distinguishes them.
   */
  projectIdPresent?: boolean;
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
  /**
   * Visibility for a repository this build creates. Only ever the two literal values the
   * user can pick between. Absent means private — see `parseClientMeta`.
   */
  githubVisibility?: 'private' | 'public';
  /** User-selected Vercel project from Integrations → Change project */
  preferredVercelProject?: string;
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

/**
 * A short display name for the product, taken from what the user actually asked for.
 *
 * The terminal wraps a prompt in conversation memory before sending it:
 *
 *   [Previous conversation for context — refer when user asks about earlier messages]
 *   …
 *   [Current message]
 *   build a landing page of dental clinic
 *
 * This function used to receive that whole block, take its first four words, and name
 * the project `[Previous Conversation For Context`. Two production runs shipped under
 * that name — it appeared as the project title in the terminal and in the build report.
 *
 * Callers now pass `userFacingPrompt`, and the context block is stripped here as well,
 * because any caller that omits `clientMeta.userPrompt` would reintroduce the same bug.
 */
export function projectNameFromPrompt(prompt: string): string {
  const currentMessage = prompt.split(/\[Current message\]\s*/i).pop() ?? prompt;
  const cleaned = currentMessage
    .replace(/^\s*\[[^\]]*\]\s*/g, '')
    // `(a|an|the)?` without a boundary matched the "a" inside "an", so
    // "create an invoicing app" was named "N Invoicing App".
    .replace(/^(build|create|make|generate|scaffold|develop)\s+(me\s+)?(?:(?:a|an|the)\b\s*)?/i, '')
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
    // Only the exact string "public" grants publication. Anything else — absent, null,
    // "PUBLIC", a truthy object, a client that never learned about this field — is
    // private. The failure mode of guessing wrong here is a permanently public
    // repository of someone else's code, so it fails closed by construction.
    githubVisibility: m.githubVisibility === 'public' ? 'public' : 'private',
    preferredVercelProject:
      typeof m.preferredVercelProject === 'string' && m.preferredVercelProject.trim().length >= 2
        ? m.preferredVercelProject.trim().slice(0, 64)
        : undefined,
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

/** A cached tree is authoritative only when GitHub says it represents this exact head. */
export function projectMemoryMatchesRemoteHead(
  memoryCommitSha: string | undefined,
  remoteHeadSha: string | undefined,
): boolean {
  return Boolean(
    memoryCommitSha &&
      remoteHeadSha &&
      memoryCommitSha.toLowerCase() === remoteHeadSha.toLowerCase(),
  );
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

  // A selected GitHub repository is the authority for its own source tree. Project
  // memory can contain a validated snapshot from a run that stopped before push;
  // treating that snapshot as committed source made a genuinely empty repository
  // appear to contain six files on the next terminal. Always reconcile the remote
  // first. A read failure stops the build instead of turning an unknown repository
  // into an empty one and risking a destructive "new" build.
  const mem = await getProjectMemoryAsync(userId, repo, branch);
  if (repo?.includes('/')) {
    try {
      const remote = await inspectConnectedRepositoryState(userId, repo, branch);
      if (remote.status === 'empty') {
        return { files: [], fromMemory: false };
      }
      if (remote.status === 'unavailable') {
        throw new Error(remote.reason);
      }
      if (
        mem?.files?.length &&
        projectMemoryMatchesRemoteHead(mem.commitSha, remote.headSha)
      ) {
        return {
          files: mem.files,
          projectName: mem.projectName || meta?.priorSite?.projectName,
          fromMemory: true,
          aiSummary: mem.aiSummary,
        };
      }
      const focused = await fetchGitHubFilesByPaths(userId, repo, UPDATE_HYDRATE_PATHS, branch);
      const files = focused.length ? focused : await fetchBuildFilesFromGitHub(userId, repo, branch);
      setProjectMemory({
        userId,
        repo,
        branch,
        projectName: mem?.projectName || meta?.priorSite?.projectName,
        files,
        commitSha: remote.headSha,
        aiSummary: mem?.aiSummary,
        aiSummaryModel: mem?.aiSummaryModel,
      });
      return {
        files,
        projectName: mem?.projectName || meta?.priorSite?.projectName,
        fromMemory: false,
        aiSummary: mem?.aiSummary,
      };
    } catch (err) {
      const safe = normalizeProviderError(err).safeMessage;
      throw new Error(`Could not read the selected GitHub repository: ${safe}`);
    }
  }

  // Local-only products may use their durable snapshot because there is no remote
  // source of truth to reconcile.
  if (mem?.files?.length) {
    return {
      files: mem.files,
      projectName: mem.projectName || meta?.priorSite?.projectName,
      fromMemory: true,
      aiSummary: mem.aiSummary,
    };
  }

  // Client priorSite is valid only for a local product. A selected repository must
  // never be shadowed by browser state.
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
    credentialOverrides?: Partial<Record<ModelId, string>>;
    validateResponse?: (result: Awaited<ReturnType<typeof chatCompletionStream>>) => void;
    budget?: Partial<BuilderAttemptBudget>;
    /** Bound the provider fan-out for low-cost flows such as a simple static site. */
    maxAttempts?: number;
    onAttemptFailure?: (record: BuilderAttemptRecord) => void;
    /**
     * Called periodically while an attempt is still waiting on the provider. Purely
     * observational — see `progressHeartbeat`. Without it the terminal shows nothing
     * for the full first-token deadline, which is 60 seconds per model in the
     * fallback order.
     */
    onWaiting?: (info: { elapsedMs: number; model: ModelId }) => void;
    /**
     * Fired for every token as it arrives, regardless of `validateResponse`.
     *
     * `onDelta` is withheld until the response passes validation, because unvalidated
     * text must never reach the user as if it were real output. That is right, and it
     * is also why the four minutes in which a project is written showed nothing at
     * all. This hook exists to narrate the stream's *structure* — which file is being
     * written, how large it has grown — without releasing its contents.
     */
    onStreamDelta?: (delta: string) => void;
  },
): Promise<Awaited<ReturnType<typeof chatCompletionStream>>> {
  const healthAwareOrder = fallbackOrderForModel(preferred);
  const candidates = healthAwareOrder.length
    ? healthAwareOrder
    : [preferred, ...BUILDER_FALLBACKS.filter((m) => m !== preferred)];
  const maxAttempts = Math.max(1, opts.maxAttempts ?? candidates.length);
  const order = candidates.slice(0, maxAttempts);
  let lastErr: Error | null = null;
  for (const modelId of order) {
    const attemptStartedAt = Date.now();
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
      const provider = MODELS[modelId].provider;
      const userCredential =
        opts.credentialOverrides?.[modelId] ??
        (opts.userId
          ? await getUserProviderKey(
              opts.userId,
              provider === 'xai' ? 'grok' : provider,
            ).catch(() => null)
          : null);
      const bufferedDeltas: string[] = [];
      const execute = async () => {
        // Every attempt runs under a first-token and generation deadline. Without
        // them a provider that accepts the connection and then goes silent held the
        // whole run open until the socket timeout, once per model in the fallback
        // order — which is how a run could stay active for many minutes and still
        // deliver nothing.
        const attempt = await runBuilderAttempt(
          async ({ signal, onToken }) => {
            const completion = await chatCompletionStream(modelId, messages, {
              maxTokens: opts.maxTokens,
              temperature: opts.temperature,
              onDelta: (delta) => {
                onToken(delta);
                opts.onStreamDelta?.(delta);
                if (opts.validateResponse) bufferedDeltas.push(delta);
                else opts.onDelta?.(delta);
              },
              signal,
              credentialOverride: userCredential || undefined,
            });
            opts.validateResponse?.(completion);
            return completion;
          },
          { budget: opts.budget, signal: opts.signal },
        );
        if (bufferedDeltas.length) opts.onDelta?.(bufferedDeltas.join(''));
        return attempt.value;
      };
      const runAttempt = () =>
        opts.userId
          ? withProviderReservation({
              userId: opts.userId,
              modelId,
              estimatedInputTokens: estimateMessageTokens(messages),
              maximumOutputTokens: opts.maxTokens ?? 8192,
              execute,
            })
          : execute();
      return opts.onWaiting
        ? await withProgressHeartbeat(
            {
              everyMs: 12_000,
              emit: (elapsedMs) => opts.onWaiting?.({ elapsedMs, model: modelId }),
            },
            runAttempt,
          )
        : await runAttempt();
    } catch (err) {
      lastErr = err as Error;
      const code = (lastErr as Error & { code?: string }).code;
      const failure = classifyBuilderFailure(lastErr);
      opts.onAttemptFailure?.({
        // §30/§31: this field reached the client. Which model failed is recorded in the
        // run trace for operators; the public field carries the one public identity.
        model: BLACK_HOLE_PUBLIC_NAME,
        failure,
        startedAt: attemptStartedAt,
        firstTokenAt: null,
        endedAt: Date.now(),
        outputChars: 0,
      });
      if (code === 'OUT_OF_TOKENS' || code === 'PAID_PROVIDER_CAPACITY_UNAVAILABLE') throw lastErr;
      // Cancellation and permanent auth failures must not walk the fallback order:
      // the first ignores the user, the second burns every route on a bad key.
      if (!isRetryableBuilderFailure(failure)) throw lastErr;
      const normalized = normalizeProviderError(lastErr);
      console.warn(`[pipeline] ${modelId} stream failed (${failure}):`, normalized.safeMessage);
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
    | 'deploy'
    | 'done',
  researchState: ResearchTodoState = 'omit',
) {
  const all = [
    { id: 'route', label: 'Request accepted' },
    { id: 'research', label: 'Inspecting project' },
    { id: 'convert', label: 'Reading files' },
    { id: 'architect', label: 'Reading files' },
    { id: 'build', label: 'Editing files' },
    { id: 'qa', label: 'Validating' },
    { id: 'compile', label: 'Validating' },
    { id: 'push', label: 'Pushing' },
    { id: 'deploy', label: 'Deploying' },
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

/** Honest end-state: completed pipeline steps stay done; only incomplete ship steps stay pending. */
function finalizeBuildTodos(
  researchState: ResearchTodoState,
  opts: {
    githubPushConfirmed: boolean;
    deployUrl: string;
    isNonWeb: boolean;
    fullyShipped: boolean;
    vercelConnected: boolean;
  },
) {
  return todosForBuild('done', researchState).map((t) => {
    if (t.id === 'push') {
      return {
        ...t,
        status: (opts.githubPushConfirmed ? 'done' : 'pending') as 'done' | 'pending',
      };
    }
    if (t.id === 'deploy') {
      if (opts.isNonWeb) {
        return {
          ...t,
          label: 'Deploy skipped (non-web)',
          status: 'skipped' as const,
        };
      }
      if (opts.deployUrl) {
        return { ...t, status: 'done' as const };
      }
      if (!opts.vercelConnected) {
        return {
          ...t,
          label: 'Connect Vercel to deploy',
          status: 'pending' as const,
        };
      }
      return { ...t, status: 'pending' as const };
    }
    // Earlier steps already ran when we reach ship/finalize
    return { ...t, status: 'done' as const };
  });
}

function wantsResearch(prompt: string, _isUpdate: boolean): boolean {
  void _isUpdate;
  if (explicitlyDisablesResearch(prompt)) return false;
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
        classification: routePrompt(opts.prompt).classification,
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
    // Item 5 — the chat research path, same staged treatment as the build path.
    // Held in a container rather than a bare `let`: TypeScript narrows a binding only ever
    // assigned inside a closure to `never`, which then propagates into the response type.
    const chatLegacyHolder: { bundle: ResearchBundle | null } = { bundle: null };
    const chatOutcome = await researchThroughBlackHole(
      { userId: opts.userId, query: opts.prompt },
      async () => {
        const bundle = await gatherResearch(opts.prompt, opts.userId);
        chatLegacyHolder.bundle = bundle;
        return {
          evidence: formatResearchForPrompt(bundle),
          sourceCount: bundle.sources.length,
        };
      },
    );
    research = chatLegacyHolder.bundle;
    researchBlock =
      chatOutcome.source === 'black_hole'
        ? chatOutcome.evidence
        : formatResearchForPrompt(
            chatLegacyHolder.bundle ?? { query: '', summary: '', sources: [], provider: 'none' },
          );
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
  runId?: string;
  userId: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  projectId?: string;
  clientMeta?: BuildClientMeta | Record<string, unknown>;
  attachments?: ChatAttachment[];
  onProgress?: ProgressFn;
  onDelta?: DeltaFn;
  /** Fired as soon as generated files exist — UI must show code before ship finishes. */
  onCodeReady?: (output: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<BuildPipelineResult> {
  const runId = opts.runId ?? randomUUID();
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
  // First line out, before any await. Everything below this point — the recovery-row
  // write, the quota check, the history load, the repository read — is real work that
  // used to happen in total silence, and a user watching an empty terminal for
  // twenty-two seconds has no way to tell it apart from a hang.
  emit({ ...startupProgress('accepted'), swarmTodos: todosForBuild('route', 'omit') });

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

  await createRunDurable(opts.userId, userFacingPrompt, runId);
  emit({ ...startupProgress('quota'), swarmTodos: todosForBuild('route', 'omit') });
  await assertHasQuota(opts.userId);
  throwIfAborted();

  // Durable chat memory across sessions (DB + client history)
  emit({ ...startupProgress('history'), swarmTodos: todosForBuild('route', 'omit') });
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
        ? 'Analyzing image(s) for design and error context…'
        : 'Analyzing document(s)…',
      swarmStatusLabel: 'Analyze',
      swarmActivity: preparedEarly.hasImages ? 'Image analysis' : 'Document extract',
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
      modelLabel: 'Xroga AI',
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
      swarmActivity: 'Xroga AI',
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

  const baseRoute = routePrompt(opts.prompt);
  // Reads the user's repository over the GitHub API — routinely the longest single
  // wait before the build starts, and previously invisible.
  emit({ ...startupProgress('repository'), swarmTodos: todosForBuild('route', 'omit') });
  const prior = await withProgressHeartbeat(
    {
      everyMs: 10_000,
      emit: (elapsedMs) =>
        emit({
          agent: 'session',
          status: 'reading_repository',
          message: heartbeatMessage('your repository files', elapsedMs),
          swarmStatusLabel: 'Reading',
          swarmTodos: todosForBuild('route', 'omit'),
        }),
    },
    () => hydratePriorFiles(opts.userId, meta),
  );
  emit({
    ...startupProgress('hydrated', { fileCount: prior.files.length }),
    swarmTodos: todosForBuild('route', 'omit'),
  });
  emit({ ...startupProgress('route'), swarmTodos: todosForBuild('route', 'omit') });
  const isUpdate = Boolean(meta?.buildUpdate && prior.files.length);
  const providerKeyName = (modelId: ModelId): string => {
    const provider = MODELS[modelId].provider;
    return provider === 'xai' ? 'grok' : provider;
  };
  const credentialOverrides: Partial<Record<ModelId, string>> = {};
  await Promise.all((Object.keys(MODELS) as ModelId[]).map(async (modelId) => {
    const key = await getUserProviderKey(
      opts.userId,
      providerKeyName(modelId),
    ).catch(() => null);
    if (key) credentialOverrides[modelId] = key;
  }));
  const runtimeRegistry = getRuntimeModelRegistry().map((model) =>
    credentialOverrides[model.id]
      ? { ...model, configured: true, credentialSource: 'user' as const }
      : model,
  );
  await loadRoutingOutcomes();
  const intelligentPlan = createIntelligentRoutePlan({
    prompt: opts.prompt,
    repositoryFiles: prior.files,
    registry: runtimeRegistry,
  });
  const implementationTask = intelligentPlan.subtasks.find((task) =>
    ['multi_file_implementation', 'code_generation', 'bug_fixing', 'refactoring'].includes(
      task.taskClass,
    ),
  );
  const reviewerTask = intelligentPlan.subtasks.find((task) =>
    ['code_review', 'security_review'].includes(task.taskClass),
  );
  const reviewerModel = reviewerTask?.selectedModel ?? 'deepseek_v4_flash';
  const executionStore = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseExecutionStateStore(opts.userId)
    : new InMemoryExecutionStateStore();
  const synthesis = await runUniversalSynthesisFoundation({
    prompt: opts.prompt,
    projectId: meta?.githubTargetRepo || prior.projectName || runId,
    runId,
    repository: meta?.githubTargetRepo ? {
      owner: meta.githubTargetRepo.split('/')[0] || '',
      name: meta.githubTargetRepo.split('/')[1] || meta.githubTargetRepo,
    } : null,
    selectedBranch: meta?.githubTargetBranch || 'main',
    files: prior.files,
    store: executionStore,
  });
  const executionState = synthesis.state;
  executionState.requiredCapabilities = [...new Set([
    ...executionState.requiredCapabilities,
    ...intelligentPlan.classification.requiredCapabilities,
  ])];
  executionState.tasks.push(...executableTasksFromRoutePlan(intelligentPlan));

  // Engineering tasks run through the canonical scheduler.
  //
  // This loop previously called `transitionTask(..., 'completed', ...)` directly with an
  // evidence sentence composed here, so two tasks were recorded as completed while no
  // handler had run — work claimed rather than performed. `ExecutionScheduler` already
  // refuses to complete a task without evidence (`result.validated && !missingEvidence`);
  // the guarantee was being bypassed rather than missing.
  //
  // Classes without a handler are blocked by the scheduler with `no handler for <class>`.
  // That is the truthful record: the canonical runtime does not yet perform implementation
  // — the legacy whole-project builder below still does — and stating that in the run is
  // the point of the migration rather than a gap to paper over.
  //
  // Nothing downstream reads `executionState` to gate the build, so correcting the record
  // changes evidence quality without changing what the user receives.
  await new ExecutionScheduler(executionStore).run(
    executionState,
    engineeringTaskHandlers({
      classification: intelligentPlan.classification,
      files: prior.files,
      repository: meta?.githubTargetRepo ?? null,
    }),
  ).catch((error) => {
    console.warn('[executionRuntime] engineering task pass skipped:', (error as Error).message);
    return executionState;
  });

  await executionStore.save(executionState).catch((error) => console.warn('[executionRuntime] initial persistence skipped:', (error as Error).message));
  const route: RouteDecision = {
    ...baseRoute,
    builder: implementationTask?.selectedModel ?? baseRoute.builder,
    reason: `${baseRoute.reason} · ${intelligentPlan.mode} route · complexity ${intelligentPlan.complexity.level}`,
  };
  let cachedSummary = prior.aiSummary;
  let usage: UsageSnapshot | null = null;
  /** Tracks whether research ran / skipped so todos never green-check empty research. */
  let researchState: ResearchTodoState = 'omit';
  let modelSwitches = 0;
  const todos = (
    step: Parameters<typeof todosForBuild>[0],
  ) => todosForBuild(step, researchState);
  const emitModelSwitch = (_from: ModelId, _to: ModelId) => {
    modelSwitches += 1;
    emit({
      agent: 'builder',
      status: 'model_fallback',
      message: 'Changed the internal execution route because of capacity or availability',
      swarmStatusLabel: 'Rerouting',
      swarmActivity: 'Compatible fallback',
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
      : 'Preparing the implementation route',
    swarmTodos: todos('route'),
  });

  // Early OAuth preflight — warn before long build so users connect before waiting
  const githubOkEarly = await isGitHubConnected(opts.userId);
  const vercelOkEarly = Boolean(await getVercelToken(opts.userId));
  const scaffoldKindEarly = detectScaffoldKind(userFacingPrompt);

  // Observation only, and off unless UNIVERSAL_AGENT_ENABLED=shadow. Nothing below reads
  // the result: it exists to record where the universal planner would have disagreed with
  // `detectScaffoldKind`, which is the only evidence available that was not produced by
  // the same reasoning that wrote the planner. `observeUniversalShadow` never throws, so
  // this cannot turn a measurement into a failed build.
  const shadowLine = describeShadowObservation(
    observeUniversalShadow({
      prompt: userFacingPrompt,
      legacyStack: scaffoldKindEarly,
      projectId: opts.projectId ?? null,
    }),
  );
  if (shadowLine) console.log(shadowLine);

  // The identity this run is routed by.
  //
  // The client sends a project id only when the browser happens to be on
  // `/dashboard/projects/<id>` — it is parsed from the URL, and builds are typed into the
  // terminal dock, which is on every route. So a real build usually arrives without one.
  //
  // `routeProject` buckets on project id, which means an absent id can never be
  // allowlisted and never lands inside a percentage. Without this the rollout dial does
  // not work: raising it to 50% would route approximately nothing, because the identity
  // being bucketed is missing from most requests. Recovering the id from the repository
  // the build already targets reads the same `(user_id, github_repo_name)` key that
  // `upsertBuildProject` writes, so it is the id this build will be recorded under.
  const resolvedProjectId =
    opts.projectId ?? (await findProjectIdByRepo(opts.userId, meta?.githubTargetRepo));

  // Which path this run took, and why, recorded on the run itself.
  //
  // Until this existed the decision was invisible after the fact: `routeProject` returns a
  // reason for every outcome and every one of them was discarded. A run that quietly took
  // the legacy path looked identical to one that was never eligible, so diagnosing "why
  // did this project not use the universal path" meant reading server logs that only say
  // anything in shadow mode — and an operator verifying a rollout could not tell an
  // unset flag from a project id that never arrived.
  //
  // `routeProject` is pure and reads the same flags `tryUniversalBuild` reads, so calling
  // it here reports the real decision rather than a second guess at it.
  const universalDecision = routeProject(resolvedProjectId);
  emit({
    agent: 'router',
    status: 'universal_routing',
    message: `Build path: ${universalDecision.useUniversal ? 'universal' : 'legacy'} — ${universalDecision.reason}`,
    // The distinguishing facts, named rather than inferred from prose: whether an id
    // arrived at all is the first thing to check when an allowlist does not match.
    universalPath: universalDecision.useUniversal,
    universalShadow: universalDecision.shadow,
    universalReason: universalDecision.reason,
    projectIdPresent: Boolean(resolvedProjectId),
    // Named separately so "the client sent it" and "we recovered it from the repository"
    // stay distinguishable — they fail for different reasons and need different fixes.
    projectIdFromClient: Boolean(opts.projectId),
  });

  // The enabled universal path. Returns null — and changes nothing below — unless
  // UNIVERSAL_AGENT_ENABLED=enabled *and* this project is allowlisted, so with production
  // on `shadow` this is unreachable and the legacy pipeline proceeds exactly as before.
  //
  // Kept as one guarded call rather than an `if` wrapped around the rest of this function:
  // the alternative leaves three thousand lines where every later edit has to remember
  // which branch it is in.
  //
  // The commit function writes through Command 1's atomic path when a repository is
  // genuinely connected, and refuses otherwise. "No repository" stays a visible failure
  // rather than a silently skipped step: a universal run that "succeeded" without
  // writing to source control would be the precise shape of dishonest evidence this
  // path exists to avoid.
  //
  // The token is read only when a repository is actually targeted, so the ordinary
  // legacy path does not pay for a lookup it will not use.
  // A holder rather than a bare `let`: the assignment happens inside the commit callback,
  // which control-flow analysis cannot see, so a plain variable narrows to `never` here.
  const universalCommit: { record: UniversalCommitRecord | null } = { record: null };
  const universalTargetRepo =
    githubOkEarly && meta?.githubTargetRepo?.includes('/') ? meta.githubTargetRepo : null;
  const universalToken = universalTargetRepo ? await getGitHubToken(opts.userId) : null;

  const universal = await tryUniversalBuild({
    runId,
    userId: opts.userId,
    projectId: resolvedProjectId,
    prompt: userFacingPrompt,
    // The same store the engineering task pass uses, so the canonical implementation task
    // is persisted alongside the rest of the run's task graph rather than in a second
    // in-memory state that dies with the process.
    executionStore,
    commit:
      universalTargetRepo && universalToken
        ? atomicGitHubCommit({
            token: universalToken,
            owner: universalTargetRepo.split('/')[0]!,
            repo: universalTargetRepo.split('/')[1]!,
            runId,
            baseBranch: meta?.githubTargetBranch || 'main',
            onRecord: (record) => {
              universalCommit.record = record;
            },
          })
        : refusingCommit(
            universalTargetRepo
              ? 'the connected GitHub authorization could not be read for this project'
              : 'no GitHub repository is connected for this project',
          ),
  });
  if (universal) {
    const { result, routing } = universal;
    emit({
      agent: 'architect',
      status: result.outcome === 'completed' ? 'done' : 'error',
      message: `Universal path: ${result.outcome} at ${result.phaseReached}. ${result.reason}`,
    });
    const universalSuccess = result.outcome === 'completed' && result.verified;
    const universalOutput: Record<string, unknown> = {
        // The typed artifact contract. Every frontend renderer keys off `type`, and this
        // object previously had none — so a run that produced real files and a real commit
        // rendered as nothing, with the text falling through to "Swarm task complete."
        //
        // Spread first so the descriptive fields below remain readable in the record and in
        // logs; `type` and `artifactVersion` come from the artifact and are not overwritten,
        // because none of the legacy keys share those names.
        ...buildEngineeringArtifact({
          outcome: result.outcome,
          phaseReached: result.phaseReached,
          verified: result.verified,
          reason: result.reason,
          blockers: result.blockers,
          commitSha: result.commitSha,
          files: result.files.map((file) => file.path),
          evidence: result.evidence,
          repository: universalCommit.record,
        }, {
          // The last hop of the browser-evidence chain. Without this the execution result
          // carried the verdict and the artifact silently dropped it, so a user was told
          // "blocked" with no way to see that the reason was an unobserved page.
          ...(result.browserVerification ? { browserVerification: result.browserVerification } : {}),
        }),
        universal: true,
        outcome: result.outcome,
        phaseReached: result.phaseReached,
        verified: result.verified,
        reason: result.reason,
        blockers: result.blockers,
        commitSha: result.commitSha,
        files: result.files.map((file) => file.path),
        evidence: result.evidence,
        ...(result.browserVerification ? { browserVerification: result.browserVerification } : {}),
        routing,
        // Observed from the write itself, not reconstructed. Present only when the run
        // actually committed, so its absence on a completed run is itself a signal.
        repository: universalCommit.record
          ? {
              owner: universalCommit.record.owner,
              repo: universalCommit.record.repo,
              branch: universalCommit.record.branch,
              baseBranch: universalCommit.record.baseBranch,
              branchCreated: universalCommit.record.branchCreated,
              startingHeadSha: universalCommit.record.startingHeadSha,
              resultingCommitSha: universalCommit.record.resultingCommitSha,
              verified: universalCommit.record.verified,
              manifest: universalCommit.record.manifest,
              pullRequest: universalCommit.record.pullRequest,
            }
          : null,
    };

    // Usage may legitimately be null here, because the universal path can refuse before
    // any model call. Recording zero tokens returns the user's real quota state rather
    // than a hand-built object that would drift from the real shape.
    const universalUsage = usageToTokenUsage(
      usage ?? (await recordUsage(opts.userId, route.builder, 0, 0)),
    );

    // Close the run record before returning.
    //
    // Every other terminal path in this function calls `completeRun`; this one returned
    // straight out, leaving the row at `status: running` with a null `completed_at`
    // forever. The build was over and nothing said so — the client polls that row, so the
    // spinner never cleared, and cancelling did nothing because there was no live run to
    // cancel, only a record that never closed.
    //
    // `success` is passed through rather than inferred, so a universal run that refused is
    // recorded as an error instead of a silent success with no commit.
    completeRun(runId, {
      output: universalOutput,
      featureCategory: 'universal',
      tokenUsage: universalUsage,
      success: universalSuccess,
    });

    return {
      runId,
      success: universalSuccess,
      featureCategory: 'universal',
      output: universalOutput,
      tokenUsage: universalUsage,
      route,
    };
  }

  // Past this line the legacy whole-project builder is the implementation path.
  //
  // `authorizeLegacyBuild` was written for §5 and then never called, which is worse than
  // not having written it: `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED=disabled` silently did
  // nothing, so the flag read as a working safety control while the builder ran anyway.
  // A rollback switch that does not switch anything is the one kind of dead code that
  // actively misleads.
  //
  // The reason is `universal_path_not_selected` because that is what the early return
  // above establishes: reaching here means `tryUniversalBuild` produced no outcome.
  // `universalAlreadyImplemented` is false for the same reason, and passing it explicitly
  // keeps §29B's one-implementer-per-run invariant checkable rather than structural.
  try {
    authorizeLegacyBuild({
      runId,
      reason: 'universal_path_not_selected',
      universalAlreadyImplemented: false,
    });
  } catch (error) {
    // A disabled builder must produce a visible refusal, not an empty build that reads as
    // a model failure. The operator who set the flag needs to see their own decision in
    // the run record; anyone debugging needs to not go looking at the providers.
    const message = (error as Error).message;
    emit({
      agent: 'builder',
      status: 'legacy_builder_disabled',
      message,
      swarmStatusLabel: 'Refused',
      swarmActivity: 'No implementation path available',
      swarmTodos: todos('route'),
    });
    failRun(runId, message, 'error', { code: 'LEGACY_BUILDER_DISABLED' });
    return {
      runId,
      success: false,
      featureCategory: 'build',
      output: { type: 'error', error: message, code: 'LEGACY_BUILDER_DISABLED' },
      // No model was called, so this reports the user's real quota state rather than a
      // hand-built zero object that would drift from the shape every other path returns.
      tokenUsage: usageToTokenUsage(await recordUsage(opts.userId, route.builder, 0, 0)),
      route,
    };
  }

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
      swarmActivity: 'Repository comprehension',
      swarmTodos: todos('route'),
    });
    await assertCanUseModel(
      opts.userId,
      prior.files.length >= 20 || route.kind === 'build_long_horizon' ? 'glm_5_2' : 'deepseek_v4_pro',
    );
    const memo = await summarizeRepoForUpdates({
      userId: opts.userId,
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
    const legacyHolder: { bundle: ResearchBundle | null } = { bundle: null };
    let blackHoleEvidence = '';
    research = await withProgressHeartbeat(
      {
        everyMs: 12_000,
        emit: (elapsedMs) =>
          emit({
            agent: 'research',
            status: 'searching',
            message: heartbeatMessage('live research sources', elapsedMs),
            swarmStatusLabel: 'Research',
            swarmTodos: todos('research'),
          }),
      },
      async () => {
        // Item 5 — research routes through the canonical layer when its stage is enabled.
        // The legacy gatherResearch remains the fallback, so the evidence a build sees is
        // never worse than before: an unavailable Black Hole route yields the old answer.
        const outcome = await researchThroughBlackHole(
          {
            userId: opts.userId,
            conversationId: opts.runId ?? null,
            projectId: opts.projectId ?? null,
            query: opts.prompt,
            signal: opts.signal,
          },
          async () => {
            const legacyBundle = await gatherResearch(opts.prompt, opts.userId);
            legacyHolder.bundle = legacyBundle;
            return {
              evidence: formatResearchForPrompt(legacyBundle),
              sourceCount: legacyBundle.sources.length,
            };
          },
        );
        blackHoleEvidence = outcome.source === 'black_hole' ? outcome.evidence : '';
        return legacyHolder.bundle ?? {
          query: opts.prompt,
          summary: '',
          sources: [],
          provider: 'none' as const,
        };
      },
    );
    researchBlock = blackHoleEvidence || formatResearchForPrompt(research);
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
        swarmActivity: 'Verified sources',
        swarmTodos: todos('convert'),
      });
    }
  }

  // Build/update with screenshot: image analysis → text brief for the builder.
  let designReference = '';
  if (preparedEarly.hasImages) {
    emit({
      agent: 'vision',
      status: 'analyzing',
      message: 'Reading attached image(s) for design and error context…',
      swarmStatusLabel: 'Vision',
      swarmActivity: 'Image analysis',
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
      designReference = `\n\nDESIGN / SCREENSHOT REFERENCE:\n${vision.text.slice(0, 6000)}`;
      emit({
        agent: 'vision',
        status: 'model_active',
        message: 'Image analysis complete',
        swarmStatusLabel: 'Vision ready',
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
  const focusedContext = prepareFocusedContext({
    files: prior.files,
    objective: userFacingPrompt,
    allowedFiles: selection.selected.map((file) => file.path),
    maximumTokens: intelligentPlan.contextStrategy.maximumContextTokens,
  });
  const implementationExecutionTask = implementationTask
    ? executionState.tasks.find((task) => task.id === implementationTask.id)
    : undefined;
  if (implementationExecutionTask) {
    implementationExecutionTask.requiredContextReferences = focusedContext.suppliedReferences;
    implementationExecutionTask.status = 'running';
    implementationExecutionTask.startedAt = new Date().toISOString();
  }
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
    swarmActivity: 'Executable brief',
    swarmTodos: todos('convert'),
  });

  // Part 2 §18/§27 — the first production responsibility moved behind Black Hole.
  //
  // The converter previously ran unconditionally: a model call on every build that rewrote
  // requests which were frequently already unambiguous. `decideConversion` answers whether the
  // call is justified, and normalizes deterministically when it is not.
  //
  // Gated on the §39 cutover plan, which defaults to `legacy_only`. With the flag unset this
  // block behaves exactly as before — the migration ships dark and is turned on deliberately,
  // which is the whole point of §39's staged rollout.
  const converterRequest = isUpdate
    ? `INCREMENTAL UPDATE to existing project "${prior.projectName || 'current site'}". Apply only this change using SEARCH/REPLACE patches (or Delete File). Do not re-analyze the whole repo: ${opts.prompt}`
    : opts.prompt;

  const blackHolePlan = readCutoverPlan();
  const conversionAnalysis = analyzeTask({
    prompt: opts.prompt,
    projectId: opts.projectId ?? null,
    repositoryMutationRequested: true,
  });
  const conversionDecision = decideConversion({
    prompt: converterRequest,
    analysis: conversionAnalysis,
    complexity: assessBlackHoleComplexity({ prompt: converterRequest, analysis: conversionAnalysis }),
    researchBlock: researchBlock || undefined,
  });
  const skipConverter = blackHolePlan.runsBlackHole && !conversionDecision.convert;

  let converted: { instruction: string; inputTokens: number; outputTokens: number };
  if (skipConverter) {
    converted = {
      instruction: conversionDecision.normalizedInstruction,
      inputTokens: 0,
      outputTokens: 0,
    };
  } else {
    await assertCanUseModel(opts.userId, 'deepseek_v4_flash');
    converted = await convertUserRequest(
      opts.userId,
      converterRequest,
      researchBlock || undefined,
    );
    usage = await recordUsage(
      opts.userId,
      'deepseek_v4_flash',
      converted.inputTokens,
      converted.outputTokens,
    );
  }

  // Architect agent — concrete file plan (real multi-agent stage).
  // Simple static landings use a deterministic plan (no extra OpenRouter wait).
  throwIfAborted();
  const scaffoldForArchitect = detectScaffoldKind(userFacingPrompt);
  const simpleStaticFastPath =
    !isUpdate &&
    scaffoldForArchitect === 'static' &&
    (route.kind === 'build_volume' || isSimpleStaticBuildPrompt(userFacingPrompt));
  const deterministicStaticUpdate = isUpdate
    ? applyDeterministicStaticUpdate(prior.files, userFacingPrompt)
    : null;
  const resilientStaticPath = simpleStaticFastPath || Boolean(deterministicStaticUpdate);

  emit({
    agent: 'architect',
    status: 'planning',
    message: resilientStaticPath
      ? 'Architect using static landing plan (fast path)…'
      : 'Architect planning file tree…',
    swarmStatusLabel: 'Architect',
    swarmActivity: resilientStaticPath ? 'Static fast path' : 'File plan',
    swarmTodos: todos('architect'),
  });
  let architectBlock = '';
  let architectPlanSummary: { stack: string; files: string[]; notes: string[] } | undefined;
  try {
    if (resilientStaticPath) {
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
          userId: opts.userId,
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
      : 'Implementing the accepted outcome…',
    swarmStatusLabel: isUpdate ? 'Patching' : 'Building',
    swarmActivity: 'Focused implementation',
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
      ? `\n\n${incrementalUpdateContext(focusedContext.files, {
          allPaths: prior.files.map((f) => f.path),
          cachedSummary,
          selectionNote: selection.reason,
          likelyDeletes,
        })}`
      : '';

  // What this kind of product has to contain. Without it the builder infers
  // completeness for itself, which is how a dental-clinic page shipped with a hero and
  // nothing else.
  const blueprint = detectProductBlueprint(userFacingPrompt);
  const blueprintBlock = blueprint ? blueprintBriefForBuilder(blueprint) : '';
  if (blueprint) {
    emit({
      agent: 'architect',
      status: 'blueprint',
      message: `${blueprint.label} — ${blueprint.sections.filter((s) => s.priority === 'required').length} required sections`,
      swarmStatusLabel: 'Architect',
      swarmActivity: `Building a ${blueprint.label.toLowerCase()}`,
      swarmTodos: todos('architect'),
    });
  }

  const builderUser = `${converted.instruction}${architectBlock}${blueprintBlock}${historyNote}${
    researchBlock ? `\n\n${researchBlock}` : ''
  }${designReference}${updateBlock}\n\nOriginal user request:\n${opts.prompt}`;

  // Narrates the builder's stream as it arrives: which file is open, how far it has
  // got, what it finished at. This is the "show me the work" surface — every line is a
  // report of bytes that have already been received, never a prediction.
  const narrator = new BuildStreamNarrator();
  const narrate = (event: NarrationEvent) =>
    emit({
      agent: 'builder',
      status: event.kind === 'file_done' ? 'file_written' : 'writing_file',
      message: narrationLine(event),
      swarmStatusLabel: isUpdate ? 'Patching' : 'Building',
      swarmTodos: todos('build'),
    });

  // Item 6 — production build model selection moves behind the canonical router.
  //
  // `route.builder` came from a keyword table with hard-coded model names. The bridge computes
  // the Black Hole answer alongside it, records the comparison for shadow mode, and returns
  // whichever the current cutover stage says to use. With the flag unset this is `route.builder`
  // unchanged, so the build path behaves exactly as before.
  const buildSelection = selectBuildModel({
    userId: opts.userId,
    conversationId: opts.runId ?? null,
    projectId: opts.projectId ?? null,
    prompt: opts.prompt,
    legacyModel: route.builder,
    repositoryFileCount: prior.files?.length,
    previousFailures: 0,
  });
  trace.setMeta({ buildRoute: { source: buildSelection.source, reason: buildSelection.reason } });

  let deterministicFiles: ProjectFile[] = [];
  let usedDeterministicScaffold = false;
  let result: ChatResult;
  try {
    result = await callBuilderStream(
      buildSelection.modelId,
      [
        { role: 'system', content: BUILDER_SYSTEM },
        { role: 'user', content: builderUser },
      ],
      {
        userId: opts.userId,
        maxTokens: resilientStaticPath ? 8192 : 16384,
        temperature: isUpdate ? 0.3 : 0.45,
        onDelta: opts.onDelta,
        onStreamDelta: (delta) => {
          for (const event of narrator.push(delta)) narrate(event);
        },
        signal: opts.signal,
        onModelFallback: (from, to) => {
          emitModelSwitch(from, to);
        },
        credentialOverrides,
        // A simple static product has a complete local generator. One bounded AI
        // attempt preserves the richer path without multiplying a silent provider's
        // 60-second deadline across the entire fleet.
        maxAttempts: resilientStaticPath ? 1 : undefined,
        budget: resilientStaticPath
          ? { firstTokenMs: 25_000, generationMs: 120_000, maxOutputChars: 600_000 }
          : undefined,
        onWaiting: ({ elapsedMs, model }) =>
          emit({
            agent: 'builder',
            status: 'awaiting_model',
            // §31: the model persona was user-visible here. The user does not act differently
            // on which model is slow, and naming it publishes fleet composition.
            message: heartbeatMessage(`${BLACK_HOLE_PUBLIC_NAME} to return code`, elapsedMs),
            swarmStatusLabel: isUpdate ? 'Patching' : 'Building',
            swarmTodos: todos('build'),
          }),
        validateResponse: (completion) => requireBuildArtifacts(completion.text, isUpdate),
      },
    );
  } catch (error) {
    const failure = classifyBuilderFailure(error);
    if (!isRetryableBuilderFailure(failure)) {
      throw error;
    }

    if (isUpdate) {
      deterministicFiles = deterministicStaticUpdate ?? [];
    } else if (scaffoldForArchitect === 'static') {
      deterministicFiles = buildScaffoldForPrompt({
        prompt: userFacingPrompt,
        projectName: projectNameFromPrompt(userFacingPrompt),
      }).files;
    }
    usedDeterministicScaffold = deterministicFiles.length > 0;
    if (!usedDeterministicScaffold) throw error;

    // This object records the attempted route while stating the actual local source.
    // It carries zero usage and is never counted as a successful model validation.
    result = {
      text: '',
      modelId: buildSelection.modelId,
      apiModel: 'deterministic-static-v1',
      provider: 'xroga-local',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    trace.setMeta({
      deterministicScaffold: {
        used: true,
        reason: failure,
        files: deterministicFiles.map((file) => file.path),
      },
    });
    emit({
      agent: 'builder',
      status: 'scaffolding',
      message: 'AI route was unavailable — continuing with Xroga’s local project generator',
      swarmStatusLabel: 'Building',
      swarmActivity: 'Resilient static generator',
      swarmTodos: todos('build'),
    });
  }
  // A response cut short leaves a fence open; reporting the partial file is the
  // evidence that it was truncated.
  for (const event of narrator.finish()) narrate(event);

  emit({
    agent: 'builder',
    status: 'model_active',
    message: 'Implementation route active',
    swarmStatusLabel: 'Building',
    swarmActivity: result.modelId === buildSelection.modelId ? 'Primary route' : 'Compatible fallback',
    swarmTodos: todos('build'),
  });

  if (!usedDeterministicScaffold) {
    usage = await recordUsage(opts.userId, result.modelId, result.inputTokens, result.outputTokens);
  }

  // Resolve output files: patches first, then full files, then classic site
  let nextFiles: ProjectFile[] = deterministicFiles;
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
            credentialOverrides,
            validateResponse: (completion) => requireBuildArtifacts(completion.text, true),
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
      modelLabel: 'Xroga AI',
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
    ? prior.projectName || projectNameFromPrompt(userFacingPrompt)
    : projectNameFromPrompt(userFacingPrompt);

  // New builds: merge deterministic scaffold under AI output
  // so user vault keys can power live /api routes and mobile/extension/desktop ship complete.
  let productScaffoldKind: ScaffoldKind = 'static';

  /**
   * Deterministic scaffold fallback.
   *
   * The scaffold merge below was gated on `nextFiles.length`, so it only ever ran
   * when the model had already produced files — which meant it could not help in
   * the one case it exists for: every provider returning empty, prose-only or
   * invalid output. That is the production blocker. A user should not receive
   * nothing merely because external builders failed, so when a new build reaches
   * this point with no files, the scaffold produces a real, buildable foundation
   * that the existing install/repair and shipping stages can carry the rest of the
   * way. These are real files written to the workspace, never a fake preview.
   */
  if (!isUpdate && !nextFiles.length) {
    const scaffoldKind = detectScaffoldKind(userFacingPrompt);
    const { files: scaffoldFiles } = buildScaffoldForPrompt({
      prompt: userFacingPrompt,
      projectName,
    });
    if (scaffoldFiles.length) {
      nextFiles = scaffoldFiles;
      productScaffoldKind = scaffoldKind;
      usedDeterministicScaffold = true;
      emit({
        agent: 'builder',
        status: 'model_active',
        message: 'Builder routes returned no files — using the deterministic scaffold',
        swarmStatusLabel: 'Building',
        swarmActivity: 'Deterministic scaffold',
        swarmTodos: todos('build'),
      });
    }
  }

  if (!isUpdate && nextFiles.length && !usedDeterministicScaffold) {
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

  // A complete standalone HTML response may be followed by zero-byte classic asset
  // fences. They are not part of the runnable product unless the HTML references them.
  // Remove only unreferenced placeholders before preview, QA, persistence and shipping;
  // referenced empty assets remain present and continue to fail structural validation.
  if (!isUpdate) nextFiles = pruneUnusedEmptyAssets(nextFiles);

  previousFiles = prior.files.length ? prior.files : landingFilesFromOutput('', '', '');

  // Deliver code to the client IMMEDIATELY — do not wait for QA/GitHub/Vercel.
  // Users were billed for LLM then saw "Connecting…" until the ship phase dropped SSE.
  {
    const readySite = filesToSite(nextFiles);
    const previewOutput: Record<string, unknown> = {
      type: 'landing_page',
      html: readySite.html,
      css: readySite.css,
      js: readySite.js,
      projectName,
      generatedFiles: nextFiles.map((f) => f.path),
      fileCount: nextFiles.length,
      scaffoldKind: productScaffoldKind,
      userPrompt: userFacingPrompt,
      isUpdate,
      shipPending: true,
      // Nothing has installed, compiled, typechecked or run at this point — the builder
      // has only just responded. This payload used to carry `buildOk: true`, which made
      // "we generated files" and "the build passed" the same claim to every consumer of
      // the preview. The lifecycle state says what is actually true, and it cannot reach
      // `verified` without passing through `testing` first.
      verificationState: 'generated_unverified',
      verificationDetail: describeVerificationState('generated_unverified'),
      message: isUpdate
        ? `Updated **${projectName}** — preview ready (not verified yet); running checks…`
        : `**${projectName}** code generated — preview below (not verified yet); running checks…`,
      changesSummary: [
        `Generated ${nextFiles.length} file(s)`,
        detectScaffoldKind(userFacingPrompt) !== 'static'
          ? `Scaffold: ${productScaffoldKind}`
          : 'Static landing',
        'Not verified yet — checks have not run',
        'Ship in progress (GitHub / Vercel)',
      ],
      modelLabel: 'Xroga AI',
    };
    try {
      opts.onCodeReady?.(previewOutput);
    } catch (err) {
      console.warn('[pipeline] onCodeReady failed:', (err as Error).message);
    }
    emit({
      agent: 'builder',
      status: 'code_ready',
      message: `${projectName} — code generated (not verified yet)`,
      swarmStatusLabel: 'Generated — not verified',
      swarmActivity: `${nextFiles.length} files`,
      swarmTodos: todos('build'),
    });
  }

  // QA review loop
  emit({
    agent: 'qa',
    status: 'reviewing',
    message: 'Reviewing build quality…',
    swarmStatusLabel: 'QA',
    swarmActivity: 'Independent review',
    swarmTodos: todos('qa'),
  });
  throwIfAborted();
  const siteForQa = filesToSite(nextFiles);
  await assertCanUseModel(opts.userId, reviewerModel);
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
  // The commit the reviewed files came from. The review runs before anything is pushed, so
  // the honest value is the base the changes were made against, not the commit they become.
  const baseCommitSha = getProjectMemory(
    opts.userId,
    meta?.githubTargetRepo,
    meta?.githubTargetBranch,
  )?.commitSha;
  let qa = await reviewBuildOutput({
    prompt: userFacingPrompt,
    html: siteForQa.html,
    css: siteForQa.css,
    js: siteForQa.js,
    isUpdate,
    files: nextFiles,
    reviewerModel,
    acceptanceCriteria: intelligentPlan.classification.reasoning,
    architectureSummary: cachedSummary || undefined,
    changedFiles: buildFileTrail(previousFiles, nextFiles).map((entry) => entry.path),
    securitySensitiveContext: intelligentPlan.classification.requiredCapabilities.filter((capability) => /security|auth|payment|blockchain/i.test(capability)),
    commitSha: baseCommitSha,
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
      reviewerModel,
      qa.inputTokens,
      qa.outputTokens,
    );
  }

  // Does the delivered product actually contain what this kind of product needs?
  // Reported and fed to the repair pass, never used to block a ship: section detection
  // reads generated markup for evidence, and a heuristic that can block would
  // eventually discard a working product — which this pipeline has already done once,
  // over an npm timeout.
  const blueprintGaps = blueprint ? missingBlueprintSections(blueprint, nextFiles) : [];
  if (blueprint && blueprintGaps.length) {
    qa = {
      ...qa,
      fixHints: [
        ...qa.fixHints,
        ...blueprintGaps.map((gap) => `Add the missing ${blueprint.label.toLowerCase()} section: ${gap.requirement}`),
      ],
    };
    emit({
      agent: 'reviewer',
      status: 'blueprint_gaps',
      message: describeBlueprintGaps(blueprint, blueprintGaps),
      swarmStatusLabel: 'Incomplete',
      swarmTodos: todos('qa'),
    });
  } else if (blueprint) {
    emit({
      agent: 'reviewer',
      status: 'blueprint_complete',
      message: `Every expected ${blueprint.label.toLowerCase()} section is present.`,
      swarmStatusLabel: 'Reviewer',
      swarmTodos: todos('qa'),
    });
  }

  const qaHadFailuresBeforeCompile = !qa.ok;

  // Real validation: dependency install, typecheck, and required framework production build.
  throwIfAborted();
  emit({
    agent: 'compiler',
    status: 'compiling',
    message: 'Production validate — install, typecheck, framework build…',
    swarmStatusLabel: 'Compile',
    swarmActivity: 'Sandbox production build',
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
  if (!usedDeterministicScaffold) {
    recordModelValidation(result.modelId, qa.ok && (compile.ok || compile.skipped));
  }

  const compileNeedsCodeRepair = validationFailureNeedsCodeRepair(compile);

  // One fix pass if QA/source validation failed and we have fix hints. A pure
  // registry/install timeout is an infrastructure blocker, not a reason to
  // spend another model call changing otherwise-unproven source files.
  // A reviewer outage is not a code defect. On run `dca6799a` the reviewer was down
  // and the compile failure was a registry timeout, and the pipeline still spent four
  // and a half minutes asking a model to repair source files that nothing had found
  // fault with.
  const qaOutage = qaWasUnavailable(qa);
  let repairLoops = 0;
  if (
    !qa.ok &&
    qa.fixHints.length &&
    !opts.signal?.aborted &&
    !(qaOutage && !compileNeedsCodeRepair) &&
    (qaHadFailuresBeforeCompile || compileNeedsCodeRepair)
  ) {
    repairLoops += 1;
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

      const failureText = [...qa.issues, ...compile.issues].join('\n');
      const repairCategory = classifyFailure(failureText);
      // Item 7 — repairs route through the canonical layer, which classifies the failure and
      // bounds the scope. The legacy selection remains the fallback so a stage rollback
      // restores the previous behaviour exactly.
      const repairSelection = selectRepairModelThroughBlackHole({
        userId: opts.userId,
        conversationId: opts.runId ?? null,
        projectId: opts.projectId ?? null,
        failureMessage: failureText,
        prompt: opts.prompt,
        attempt: 1,
        exclude: [result.modelId],
        legacyModel: legacySelectRepairModel(repairCategory, [result.modelId]) ?? buildSelection.modelId,
      });
      const repairModel = repairSelection.modelId;
      trace.setMeta({
        repairRoute: {
          category: repairCategory,
          scope: repairSelection.scope,
          source: repairSelection.source,
          modelChanged: repairModel !== result.modelId,
          evidenceItems: qa.issues.length + compile.issues.length,
        },
      });
      const fixResult = await callBuilderStream(
        repairModel,
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
          credentialOverrides,
          validateResponse: (completion) => requireBuildArtifacts(completion.text, isUpdate),
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

      if (!isUpdate) nextFiles = pruneUnusedEmptyAssets(nextFiles);

      const reQaSite = filesToSite(nextFiles);
      qa = await reviewBuildOutput({
        prompt: userFacingPrompt,
        html: reQaSite.html,
        css: reQaSite.css,
        js: reQaSite.js,
        isUpdate,
        files: nextFiles,
        reviewerModel,
        acceptanceCriteria: intelligentPlan.classification.reasoning,
        architectureSummary: cachedSummary || undefined,
        changedFiles: buildFileTrail(previousFiles, nextFiles).map((entry) => entry.path),
        validationResults: [{ kind: 'production_build', ok: compile.ok, command: compile.buildCommand, exitCode: compile.buildExitCode }],
      });
      if (qa.inputTokens || qa.outputTokens) {
        usage = await recordUsage(
          opts.userId,
          reviewerModel,
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
      recordModelValidation(fixResult.modelId, qa.ok && (compile.ok || compile.skipped));
    } catch (err) {
      console.warn('[pipeline] QA fix pass failed:', normalizeProviderError(err).safeMessage);
    }
  } else if (!qa.ok && !opts.signal?.aborted && !compileNeedsCodeRepair) {
    emit({
      agent: 'compiler',
      status: 'repair_skipped',
      message: qaOutage
        ? 'The reviewer and the dependency install were both unavailable. Editing the code cannot repair either, so the build continues to ship.'
        : 'Dependency installation timed out. Code repair was skipped because it cannot repair a package-registry or network timeout.',
      swarmStatusLabel: 'Not verified here',
      swarmActivity: 'Infrastructure unavailable',
      swarmTodos: todos('compile'),
    });
  }

  executionState.currentWorkingSnapshot = nextFiles;
  executionState.changedFiles = buildFileTrail(previousFiles, nextFiles).map((entry) => entry.path);
  executionState.validationResults.push({
    class: 'framework_production_build', command: compile.buildCommand,
    exitCode: compile.buildExitCode, ok: compile.ok,
    safeOutputSummary: compile.ok ? 'Production validation passed' : compile.issues.slice(0, 4).join('; '),
    timestamp: new Date().toISOString(), taskId: implementationTask?.id,
  });
  if (implementationTask) transitionTask(executionState, implementationTask.id, qa.ok && productionValidationAllowsDeployment(compile) ? 'completed' : 'failed', {
    evidence: qa.ok && productionValidationAllowsDeployment(compile) ? [{
      id: randomUUID(), kind: 'validated_implementation', summary: `${executionState.changedFiles.length} changed files passed required validation`, timestamp: new Date().toISOString(),
    }] : undefined,
    blocker: qa.ok ? compile.issues.join('; ') : qa.issues.join('; '),
  });
  if (reviewerTask) {
    executionState.reviewer = { provider: MODELS[reviewerModel].provider, model: reviewerModel, taskId: reviewerTask.id };
    executionState.reviewFindings = qa.findings.map((finding) => ({ id: randomUUID(), ...finding, resolved: false }));
    transitionTask(executionState, reviewerTask.id, qa.ok ? 'completed' : 'failed', {
      evidence: qa.ok ? [{ id: randomUUID(), kind: 'independent_review', summary: 'Independent reviewer completed structured review', timestamp: new Date().toISOString() }] : undefined,
      blocker: qa.ok ? undefined : qa.issues.join('; '),
    });
  }
  await executionStore.save(executionState).catch((error) => console.warn('[executionRuntime] validation persistence skipped:', (error as Error).message));

  await recordRoutingOutcome({
    runId,
    userId: opts.userId,
    taskClass: implementationTask?.taskClass ?? route.kind,
    modelId: result.modelId,
    mode: intelligentPlan.mode,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    patchApplied: usedPatches,
    typecheckOk: compile.skipped ? undefined : compile.tscOk,
    buildOk: compile.ok,
    reviewOk: qa.ok,
    requiredCapabilities: intelligentPlan.classification.requiredCapabilities,
    provider: usedDeterministicScaffold ? 'xroga-local' : MODELS[result.modelId].provider,
    repairLoops,
    modelSwitches,
    recoverySucceeded:
      repairLoops > 0 ? qa.ok && (compile.ok || compile.skipped) : undefined,
  });

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
  let githubPushError: string | undefined;
  let commitSha: string | undefined;
  const priorCommitSha = baseCommitSha;
  let githubBranch = meta?.githubTargetBranch || 'main';
  let deployUrl = '';
  let deployVerified = false;
  let vercelPreviewUrl: string | undefined;
  const executionEvidence: OperationEvidence[] = [];

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
  const remoteRepoState =
    isUpdate && githubOk && meta?.githubTargetRepo
      ? await inspectConnectedRepositoryState(
          opts.userId,
          meta.githubTargetRepo,
          githubBranch,
        ).catch((error) => ({
          status: 'unavailable' as const,
          branch: githubBranch,
          reason: redactSecrets((error as Error).message || 'GitHub inspection failed').slice(0, 160),
        }))
      : undefined;
  const supabaseStatus = await getUserSupabaseStatus(opts.userId).catch(() => ({
    connected: false,
    ready: false,
    provisioned: false,
    message: '',
  }));
  // Re-check structure right before push (after QA fix passes may have changed files)
  const structureFinal = staticValidateProject(nextFiles);
  const qaBlocksShip = !structureFinal.ok;

  // Our sandbox failing is not the user's product failing. A registry timeout or a
  // reviewer outage produces no evidence about their code — and refusing to push means
  // we never obtain any, while guaranteeing they receive nothing. Vercel runs a real
  // install and a real production build on every deployment, so when we cannot run one
  // here, that build is the verification. A genuine code defect still blocks.
  const validation = classifyValidation({ compile, qa, structureOk: structureFinal.ok });
  const compileBlocksShip = validation.verdict === 'code_defect';
  // `compileBlocksShip` means "the overall verdict is code_defect", which can be true
  // for reasons that have nothing to do with compiling — a static site with no
  // package.json always skips compile, harmlessly. Run e1f37426 shipped nothing and
  // told the user "No package.json — static project, skipped compile. Nothing was
  // pushed or deployed." while the real reason — the reviewer had found the HTML
  // truncated, the booking form and admin modal missing, and key JS functions like
  // generateTimeSlots absent — sat unseen in the QA notes panel.
  const compileBlockerMessage = selectShipBlockerMessage({
    verdictIsCodeDefect: compileBlocksShip,
    structureOk: structureFinal.ok,
    compile,
    qa,
    repairAttempts: repairLoops,
  });
  const unverifiedNote =
    validation.verdict === 'not_verified'
      ? describeUnverifiedShip(validation.unverifiedReasons)
      : null;
  if (unverifiedNote) {
    emit({
      agent: 'compiler',
      status: 'not_verified_locally',
      message: unverifiedNote,
      swarmStatusLabel: 'Not verified here',
      swarmTodos: todos('compile'),
    });
  }
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
  if (compileBlockerMessage) shipBlockers.push(compileBlockerMessage);
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

  const githubShippingPlan = planGitHubShipping({
    isUpdate,
    targetRepo: meta?.githubTargetRepo,
    nextFiles,
    changedFiles,
    deletedPaths,
    priorCommitSha,
    remoteState: remoteRepoState,
  });
  if (githubShippingPlan.blocker) shipBlockers.push(githubShippingPlan.blocker);

  let filesToPush = githubShippingPlan.filesToPush;
  if (isUpdate && nextFiles.length) {
    const docs = nextFiles.filter((f) => f.path === '.env.example' || f.path === 'SECRETS.md');
    if (docs.length) {
      const byPath = new Map(filesToPush.map((f) => [f.path, f]));
      for (const f of docs) byPath.set(f.path, f);
      filesToPush = Array.from(byPath.values());
    }
  }

  // Persist the validated canonical snapshot before any external mutation. A Fly
  // restart or interrupted provider call must not erase completed generation work.
  let projectMemoryPersistenceError: string | undefined;
  if (
    nextFiles.length &&
    !patchAborted &&
    !security.blocked &&
    !compileBlocksShip &&
    !qaBlocksShip
  ) {
    try {
      const saved = await setProjectMemoryDurable({
        userId: opts.userId,
        repo: meta?.githubTargetRepo,
        branch: githubBranch,
        projectName,
        files: nextFiles,
        commitSha: priorCommitSha,
        aiSummary: cachedSummary,
      });
      if (saved.persistence === 'memory_only') {
        projectMemoryPersistenceError = 'Durable project storage is not configured';
      }
    } catch (err) {
      projectMemoryPersistenceError = redactSecrets((err as Error).message).slice(0, 200);
    }
    if (projectMemoryPersistenceError) {
      emit({
        agent: 'build',
        status: 'snapshot_persistence_failed',
        message: `Generated files remain available in this run, but durable recovery is unavailable: ${projectMemoryPersistenceError}`,
        swarmStatusLabel: 'Recovery unavailable',
        swarmActivity: projectMemoryPersistenceError,
        swarmTodos: todos('push'),
      });
    }
  }

  if (githubShippingPlan.reuseCommitSha && meta?.githubTargetRepo) {
    commitSha = githubShippingPlan.reuseCommitSha;
    githubPushConfirmed = true;
    githubRepoName = meta.githubTargetRepo;
    githubRepoUrl = `https://github.com/${meta.githubTargetRepo}`;
    executionEvidence.push(
      createEvidence({
        kind: 'commit',
        operation: 'github_existing_commit',
        ok: true,
        identifier: commitSha,
        details: { repository: githubRepoName, branch: githubBranch, reused: true },
      }),
    );
    emit({
      agent: 'deploy',
      status: 'push_verified_existing',
      message: `Verified existing ${commitSha.slice(0, 12)} on ${githubRepoName}; no duplicate commit needed`,
      swarmStatusLabel: 'Commit verified',
      swarmActivity: githubRepoName,
      swarmTodos: todos('deploy'),
    });
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
    !githubShippingPlan.blocker &&
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
        // Lets the write open `xroga/<run-id>` with a pull request when the target branch
        // is protected, instead of failing the build or committing without approval.
        runId,
        // New Product + an explicitly selected repository may create its first
        // parentless commit only if GitHub still proves it empty at write time.
        allowEmptyBootstrap: !isUpdate && prior.files.length === 0,
        visibility: meta?.githubVisibility ?? 'private',
      });
      githubRepoUrl = pushed.htmlUrl;
      githubRepoName = pushed.repoName;
      const verifiedCommitSha = pushed.commitSha;
      if (
        typeof verifiedCommitSha !== 'string' ||
        !/^[0-9a-f]{7,40}$/i.test(verifiedCommitSha)
      ) {
        throw new Error('GitHub push returned without a valid commit SHA');
      }
      commitSha = verifiedCommitSha;
      githubPushConfirmed = true;
      githubBranch = pushed.branch || githubBranch;
      executionEvidence.push(
        createEvidence({
          kind: 'commit',
          operation: 'github_push',
          ok: true,
          identifier: verifiedCommitSha,
          details: {
            repository: pushed.repoName || githubRepoName || '',
            // The branch actually written, which is not always the branch requested: a
            // protected target becomes `xroga/<run-id>` plus a pull request. Recording the
            // requested branch here would make the evidence describe a write that did not
            // happen.
            branch: githubBranch,
            ...(pushed.pullRequestUrl ? { pullRequest: pushed.pullRequestUrl } : {}),
          },
        }),
      );
      if (pushed.warning) shipBlockers.push(pushed.warning);
      emit({
        agent: 'deploy',
        status: 'pushed',
        message: pushed.pullRequestUrl
          ? `Opened ${pushed.pullRequestUrl} from ${githubBranch} (${verifiedCommitSha.slice(0, 12)})`
          : `Pushed ${verifiedCommitSha.slice(0, 12)} to ${pushed.repoName || githubRepoName}`,
        swarmStatusLabel: pushed.pullRequestUrl ? 'PR opened' : 'Pushed',
        swarmActivity: pushed.pullRequestUrl || pushed.htmlUrl || pushed.repoName || 'GitHub',
        // Push done — next step is deploy (or non-web artifacts)
        swarmTodos: isNonWebProduct
          ? todos('push').map((t) =>
              t.id === 'push'
                ? { ...t, status: 'done' as const }
                : t.id === 'deploy'
                  ? { ...t, label: 'Ship artifacts', status: 'active' as const }
                  : t,
            )
          : todos('deploy'),
      });
    } catch (err) {
      // Typed refusals from the atomic write path describe themselves, and the one fact
      // that matters most to whoever reads this — that the branch was not changed — only
      // survives if it comes from there rather than from a raw vendor message.
      githubPushError = redactSecrets(
        describeGitHubWriteFailure(err) || 'Unknown GitHub error',
      ).slice(0, 240);
      shipBlockers.push(`GitHub push failed: ${githubPushError}`);
      console.warn('[pipeline] GitHub push failed:', githubPushError);
      emit({
        agent: 'deploy',
        status: 'push_failed',
        message: `GitHub push failed: ${githubPushError}`,
        swarmStatusLabel: 'Push failed',
        swarmActivity: githubPushError.slice(0, 120),
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

  // Acknowledge the final snapshot (including the verified commit) before deploy/final response.
  if (nextFiles.length || deletedPaths.length) {
    try {
      const saved = await setProjectMemoryDurable({
        userId: opts.userId,
        repo: githubRepoName || meta?.githubTargetRepo,
        branch: githubBranch,
        projectName,
        files: nextFiles,
        commitSha,
        aiSummary: cachedSummary,
      });
      projectMemoryPersistenceError =
        saved.persistence === 'memory_only'
          ? 'Durable project storage is not configured'
          : undefined;
    } catch (err) {
      projectMemoryPersistenceError = redactSecrets((err as Error).message).slice(0, 200);
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
    !githubShippingPlan.blocker &&
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
      swarmActivity: meta?.preferredVercelProject
        ? `Vercel · ${meta.preferredVercelProject}`
        : 'Vercel file upload',
      swarmTodos: todos('deploy'),
    });
    try {
      const preferred =
        meta?.preferredVercelProject
          ?.toLowerCase()
          .replace(/[^a-z0-9-_]/gi, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) || '';
      const slug =
        preferred ||
        (githubRepoName?.split('/').pop() || projectName)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) ||
        'xroga-build';
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
          swarmTodos: todos('deploy'),
        });
      }
      if (deployed.deployUrl) {
        deployUrl = deployed.deployUrl;
        deployVerified = deployed.deployVerified;
        vercelPreviewUrl = deployed.vercel?.deployUrl || deployed.deployUrl;
        emit({
          agent: 'deploy',
          status: deployVerified ? 'deployed' : 'deploy_pending_verification',
          message: deployVerified
            ? `Verified live on Vercel: ${deployUrl}`
            : `Vercel returned a deployment URL; reachability verification is pending: ${deployUrl}`,
          swarmStatusLabel: deployVerified ? 'Live · verified' : 'Verify deploy',
          swarmActivity: deployVerified ? deployUrl : 'Checking deployment URL',
          swarmTodos: deployVerified
            ? todos('done').map((t) => ({ ...t, status: 'done' as const }))
            : todos('deploy'),
        });
      } else if (deployed.deployError) {
        const deployFailure = describeVercelDeployFailure(
          redactSecrets(deployed.deployError),
          { githubRepoName },
        );
        const reauth = isVercelAuthFailure(deployed.deployError);
        if (reauth) await clearVercelConnection(opts.userId).catch(() => {});
        shipBlockers.push(deployFailure);
        emit({
          agent: 'deploy',
          status: reauth ? 'deploy_reauth_required' : 'deploy_failed',
          message: deployFailure,
          swarmStatusLabel: reauth ? 'Reconnect Vercel' : 'Deploy issue',
          swarmTodos: todos('deploy'),
          ...(reauth ? { needsVercel: true } : {}),
        });
      }
    } catch (err) {
      const raw = redactSecrets((err as Error).message || 'Unknown Vercel error');
      const deployFailure = describeVercelDeployFailure(raw, { githubRepoName });
      // An `invalidToken` rejection means the stored authorization is dead. Leaving it
      // in place makes the account look connected, so every later build repeats this
      // same failure with no way for the user to know why.
      const reauth = isVercelAuthFailure(raw);
      if (reauth) await clearVercelConnection(opts.userId).catch(() => {});
      shipBlockers.push(deployFailure);
      console.warn('[pipeline] Vercel deploy failed:', deployFailure);
      emit({
        agent: 'deploy',
        status: reauth ? 'deploy_reauth_required' : 'deploy_failed',
        message: deployFailure,
        swarmStatusLabel: reauth ? 'Reconnect Vercel' : 'Deploy failed',
        swarmTodos: todos('deploy'),
        ...(reauth ? { needsVercel: true } : {}),
      });
    }
  } else if (!isNonWebProduct && !vercelToken && !patchAborted && !security.blocked) {
    shipBlockers.push('Connect Vercel under Integrations to deploy live to your domain');
    emit({
      agent: 'deploy',
      status: 'deploy_skipped',
      message: githubPushConfirmed
        ? 'Code is on GitHub — connect Vercel to auto-deploy to your domain'
        : 'Connect Vercel to deploy this build to your domain',
      swarmStatusLabel: 'Need Vercel',
      swarmActivity: 'Authorize Vercel',
      swarmTodos: todos('deploy').map((t) =>
        t.id === 'deploy'
          ? { ...t, label: 'Connect Vercel to deploy', status: 'pending' as const }
          : t.id === 'push'
            ? { ...t, status: (githubPushConfirmed ? 'done' : t.status) as typeof t.status }
            : t,
      ),
      needsVercel: true,
    });
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
      swarmTodos: todos('deploy'),
    });
    shipVerify = await verifyShippedProduct({
      deployUrl: deployUrl || vercelPreviewUrl,
      githubPushConfirmed,
      githubRepoUrl,
      expectApiHealth: expectApi,
    });
    deployVerified = shipVerify.liveOk || deployVerified;
    if (deployUrl || vercelPreviewUrl) {
      executionEvidence.push(
        createEvidence({
          kind: 'deployment',
          operation: 'deployment',
          ok: Boolean(shipVerify.liveOk),
          identifier: deployUrl || vercelPreviewUrl,
          details: {
            reachable: Boolean(shipVerify.liveOk),
            healthOk: shipVerify.healthOk === true,
          },
        }),
      );
    }
  }

  if (projectMemoryPersistenceError && !githubPushConfirmed) {
    shipBlockers.push(`Project recovery snapshot failed: ${projectMemoryPersistenceError}`);
  }

  const outcome = computeShipOutcome({
    kind: productScaffoldKind,
    patchAborted,
    securityBlocked: security.blocked,
    compileBlocksShip,
    // The specific stage + diagnostic, so this path cannot fall back to the old
    // generic "fix TypeScript/install before ship" instruction either.
    compileBlockerMessage,
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
  // Preserve the specific runtime failure before the generic outcome category.
  const finalBlockers = [...new Set([...shipBlockers, ...outcome.shipBlockers])];
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
    evidence: executionEvidence,
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
      swarmTodos: finalizeBuildTodos(researchState, {
        githubPushConfirmed,
        deployUrl: deployUrl || vercelPreviewUrl || '',
        isNonWeb: isNonWebProduct,
        fullyShipped,
        vercelConnected: Boolean(vercelToken),
      }),
    });
    trace.setMeta({
      shipVerify: summaryLines,
      fullyShipped,
      buildOk,
      shipOutcome: shipOutcomeMeta,
    });
  }

  const outSite = filesToSite(nextFiles);

  const finalTodos = finalizeBuildTodos(researchState, {
    githubPushConfirmed,
    deployUrl: deployUrl || vercelPreviewUrl || '',
    isNonWeb: isNonWebProduct,
    fullyShipped,
    vercelConnected: Boolean(vercelToken),
  });

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
    swarmTodos: finalTodos,
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
  // When validation could not run, say so instead of printing a red cross next to a
  // product that was shipped anyway — a bare ❌ beside working code is what made the
  // previous report read as a failure when it was not one.
  const compileMarkdown = unverifiedNote
    ? `\n\n### Verification\n⚠️ ${unverifiedNote}`
    : !compile.skipped
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
    // Present only when the code shipped without local verification, so the UI can
    // show a warning rather than either a silent pass or a false failure.
    ...(unverifiedNote ? { validationNotVerified: unverifiedNote } : {}),
    ...(blueprint ? { productType: blueprint.label } : {}),
    ...(blueprint && blueprintGaps.length
      ? { missingSections: blueprintGaps.map((gap) => gap.requirement) }
      : {}),
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
    modelLabel: 'Xroga AI',
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
    executionEvidence,
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
    completedTodos: finalTodos,
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
