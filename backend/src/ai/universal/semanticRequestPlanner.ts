import { chatCompletion, estimateMessageTokens, type ChatMessage } from '../openaiCompat.js';
import { callableModelIds, type ModelId } from '../models.js';
import { withProviderReservation } from '../providerBudget.js';
import { executeWithProviderFallback, recordModelValidation } from '../providerRuntime.js';
import { getUsage, recordUsage, usageToTokenUsage } from '../quota.js';
import { universalCapabilityRegistry } from '../../capabilities/index.js';
import { generateStructured } from '../black-hole/structuredOutput.js';
import { goalContractSchema, normalizeGoalContractCandidate, type GoalContract, type GoalInterpretationInput } from './goalContract.js';
import { planCapabilities } from './planner.js';
import { currentProductTruth } from './productTruth.js';
import { RuntimeFailure } from './runtimeFailure.js';
import { getGitHubToken } from '../../services/integrations/githubAuth.js';

export type UniversalDispatch = 'chat' | 'build' | 'blocked';

export interface SemanticRequestPlan {
  readonly goalContract: GoalContract;
  readonly dispatch: UniversalDispatch;
  readonly capabilityIds: readonly string[];
  readonly rationale: string;
  readonly blockers: readonly string[];
  readonly usage: ReturnType<typeof usageToTokenUsage>;
  /** Completes a bounded social protocol turn without a second model call. */
  readonly directResponse?: string;
}

export function interpreterModelOrder(env: NodeJS.ProcessEnv = process.env): ModelId[] {
  const callable = callableModelIds(env);
  const ordered = (['deepseek_v4_flash', 'glm_5_3_flash', 'glm_5_3', 'kimi_k3'] as const)
    .filter((modelId) => callable.includes(modelId));
  if (ordered.length) return ordered;
  throw new RuntimeFailure(
    'PLANNER_PROVIDER_UNAVAILABLE',
    'No configured model is currently available to understand this request.',
  );
}

const SOCIAL_GREETING_HEAD = /^(?:hi|hello(?:\s+there)?|hey(?:\s+there)?|howdy|hola|good\s+(?:morning|afternoon|evening))\b/i;
const SOCIAL_GREETING_TAIL = /^(?:[!.,\s]*|\s*(?:—|–|-|,)\s*(?:(?:i(?:'m|\s+am)\s+)?(?:glad|happy|pleased)\s+to\s+(?:be\s+here|meet\s+you|connect)|(?:it(?:'s|\s+is)\s+)?nice\s+to\s+(?:meet\s+you|connect)|hope\s+(?:you(?:'re|\s+are)\s+well|all\s+is\s+well))[!.,\s]*)$/i;
const SOCIAL_ACKNOWLEDGEMENT = /^(?:thanks|thank\s+you|thank\s+you\s+very\s+much|okay|ok|got\s+it|bye|goodbye)[!.,\s]*$/i;

/**
 * A deliberately tiny protocol optimization, never an intent router. Questions,
 * attachments and every side-effecting request always continue to semantic planning.
 */
export function protocolSocialResponse(message: string, hasAttachments = false): string | null {
  if (hasAttachments) return null;
  const normalized = message.trim();
  if (!normalized || normalized.includes('?')) return null;
  const greeting = normalized.match(SOCIAL_GREETING_HEAD);
  if (greeting && SOCIAL_GREETING_TAIL.test(normalized.slice(greeting[0].length))) {
    return 'Hey! 👋 What can I help you accomplish today?';
  }
  if (SOCIAL_ACKNOWLEDGEMENT.test(normalized)) {
    return /bye|goodbye/i.test(normalized) ? 'See you soon!' : 'You’re welcome!';
  }
  return null;
}

export async function planProtocolSocialTurn(input: {
  userId: string;
  message: string;
  attachments?: GoalInterpretationInput['attachments'];
}): Promise<SemanticRequestPlan | null> {
  const directResponse = protocolSocialResponse(input.message, Boolean(input.attachments?.length));
  if (!directResponse) return null;
  const goalContract = goalContractSchema.parse({
    version: '1.0',
    goal: input.message,
    desiredOutcome: 'A brief conversational acknowledgement.',
    semanticIntent: 'ANSWER',
    constraints: ['Do not start tools, repository work, web retrieval, Preview, or deployment.'],
    acceptance: ['Respond immediately and briefly.'],
    historyContext: [],
    projectContext: null,
    deliverables: [],
    requiredCapabilities: ['conversation.respond'],
    requiredAuthorities: [],
    risks: [],
    confidence: 1,
    blockers: [],
    contextComplexity: 'low',
  });
  return {
    goalContract,
    dispatch: 'chat',
    capabilityIds: ['conversation.respond'],
    rationale: 'Completed by the bounded social protocol path without execution side effects.',
    blockers: [],
    usage: usageToTokenUsage(await getUsage(input.userId)),
    directResponse,
  };
}

export async function resolveStructuredGoalContract(
  attempt: (repairHint?: string) => Promise<string>,
  maxRepairs = 1,
): Promise<GoalContract> {
  const generated = await generateStructured<GoalContract>({
    maxRepairs,
    attempt,
    validate: (value) => {
      const parsed = goalContractSchema.safeParse(normalizeGoalContractCandidate(value));
      return parsed.success
        ? { valid: true, value: parsed.data }
        : { valid: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
    },
  });
  if (generated.ok) return generated.value;
  const schemaFailure = generated.detail !== 'the reply did not contain parseable JSON'
    && generated.detail !== 'the model returned no content';
  throw new RuntimeFailure(
    schemaFailure ? 'PLANNER_SCHEMA_INVALID' : 'PLANNER_INVALID_OUTPUT',
    'Xroga received an unusable planning response after one bounded correction attempt.',
    { details: { reason: generated.reason, repairs: generated.repairs } },
  );
}

export function dispatchForGoal(goal: GoalContract, capabilityIds: readonly string[]): UniversalDispatch {
  if (goal.blockers.length) return 'blocked';
  const descriptors = capabilityIds.map((id) => universalCapabilityRegistry.get(id)).filter(Boolean);
  if (descriptors.some((item) => item!.effects.includes('write')) || capabilityIds.includes('software.implement')) {
    return 'build';
  }
  if (goal.semanticIntent === 'MODIFY') return 'blocked';
  if (goal.semanticIntent === 'EXTERNAL_ACTION') {
    // Some interpreters describe a public-web lookup as an external action even though its
    // executable capabilities are strictly read-only. Authority and capability resolution
    // above are the security boundary; do not turn an authorized read into a false refusal
    // merely because the semantic label is broader than the selected effects.
    const authorizedReadOnlyExternal = descriptors.some((item) => item!.effects.includes('external'))
      && descriptors.every((item) => !item!.effects.includes('write'))
      && descriptors.every((item) => item!.requiredAuthorities.every((authority) =>
        authority === 'model:execute' || /(?:^|[:-])read$/.test(authority)));
    return authorizedReadOnlyExternal ? 'chat' : 'blocked';
  }
  return 'chat';
}

export function unresolvedGoalBlockers(blockers: readonly string[], grantedAuthorities: ReadonlySet<string>): string[] {
  return blockers.filter((blocker) => {
    const normalized = blocker.toLowerCase();
    if (!normalized.includes('authorit')) return true;
    return ![...grantedAuthorities].some((authority) => normalized.includes(authority.toLowerCase()));
  });
}

/**
 * Deterministic intent for the explicit composer `/build` command.
 *
 * This is not a natural-language classifier or product-type guess. The command is a direct
 * user choice to modify the canonical selected project, so routing it through an unreliable
 * model just to rediscover that choice creates a needless single point of failure.
 */
export async function planExplicitProjectBuild(input: {
  userId: string;
  message: string;
  projectContext: NonNullable<GoalInterpretationInput['projectContext']>;
}): Promise<SemanticRequestPlan> {
  const goal = input.message.replace(/^\/build\b\s*/i, '').trim();
  if (!goal) throw Object.assign(new Error('The /build command needs a requested change.'), { code: 'INVALID_GOAL' });
  const requiredCapabilities = ['repository.read', 'software.implement', 'validation.run', 'repository.write'];
  const goalContract = goalContractSchema.parse({
    version: '1.0',
    goal,
    desiredOutcome: 'Implement and validate the requested change in the selected project.',
    semanticIntent: 'MODIFY',
    constraints: ['Keep all work scoped to the canonical selected repository, branch, and project root.'],
    acceptance: ['Produce repository changes and validation evidence without changing the selected project target.'],
    historyContext: [],
    projectContext: input.projectContext,
    deliverables: [{
      id: 'repository-change',
      mediaType: 'application/vnd.xroga.repository-change+json',
      description: 'Validated changes for the selected software project.',
      required: true,
      acceptance: ['The write target equals the canonical project context.'],
    }],
    requiredCapabilities,
    requiredAuthorities: ['repository:read', 'repository:write', 'model:execute', 'sandbox:execute'],
    risks: ['Repository content may change only after target and write invariants pass.'],
    confidence: 1,
    blockers: [],
    contextComplexity: 'unknown',
  });
  const usage = usageToTokenUsage(await getUsage(input.userId));
  return {
    goalContract,
    dispatch: 'build',
    capabilityIds: requiredCapabilities,
    rationale: 'The user explicitly selected the /build command for the canonical active project.',
    blockers: [],
    usage,
  };
}

export async function resolveRequestAuthorities(
  input: Pick<Parameters<typeof planSemanticRequest>[0], 'userId' | 'attachments' | 'projectContext'>,
  hasGitHubAuthorization: (userId: string) => Promise<boolean> = async (userId) => Boolean(await getGitHubToken(userId)),
): Promise<Set<string>> {
  const authorities = new Set<string>(['model:execute', 'sandbox:execute']);
  if (input.attachments?.length) authorities.add('attachment:read');
  if (input.projectContext && await hasGitHubAuthorization(input.userId)) {
    authorities.add('repository:read');
    authorities.add('repository:write');
  }
  if (process.env.PARALLEL_API_KEY) authorities.add('network:public-read');
  if (process.env.XAI_API_KEY) authorities.add('network:x-read');
  return authorities;
}

export async function planSemanticRequest(input: {
  userId: string;
  message: string;
  history?: GoalInterpretationInput['history'];
  attachments?: GoalInterpretationInput['attachments'];
  projectContext?: GoalInterpretationInput['projectContext'];
  projectState?: GoalInterpretationInput['projectState'];
}): Promise<SemanticRequestPlan> {
  const social = await planProtocolSocialTurn(input);
  if (social) return social;

  // Two bounded routes are enough for resilience without multiplying a harmless
  // request into four serial 45-second waits.
  const models = interpreterModelOrder().slice(0, 2);
  const available = universalCapabilityRegistry.list();
  // A visible project is context, not authorization. Reading the persisted
  // token is a local authorization check (not a GitHub network/status call),
  // so pure conversation avoids an external request while repository
  // capabilities are never advertised as READY for another or disconnected
  // account.
  const authorities = await resolveRequestAuthorities(input);
  const readiness = new Map(universalCapabilityRegistry.snapshot(authorities).map((item) => [item.id, item]));
  const availableSummary = available.map(({ id, title, description, effects, requiredAuthorities, inputMediaTypes, outputMediaTypes }) => ({
    id, title, description, effects, requiredAuthorities, inputMediaTypes, outputMediaTypes,
    readiness: readiness.get(id)?.state ?? 'UNSUPPORTED',
  }));
  const system = `Understand the user's current goal from the full conversation and context. Return strict JSON matching the supplied GoalContract schema. Do not use product modes, keyword categories, framework guesses, or a default website/build route. Choose the smallest READY capability set that can genuinely produce the requested outcome. Read-only analysis must remain read-only. A project being present is context, not evidence of modification intent. Authority availability is determined by the runtime, not by you. Never report a granted authority as missing. Use blockers only for essential missing user input, AUTH_REQUIRED, PROVIDER_UNAVAILABLE, TEMPORARILY_UNAVAILABLE, or UNSUPPORTED capability. Never call information current unless freshnessRequirement is PREFERRED or CURRENT_REQUIRED.\n\n${currentProductTruth(authorities)}\n\nGranted authorities: ${JSON.stringify([...authorities])}.\n\nGoalContract fields: version="1.0"; goal; desiredOutcome; semanticIntent=ANSWER|INVESTIGATE|PROPOSE|MODIFY|EXTERNAL_ACTION|MIXED; constraints[]; acceptance[]; historyContext[]; projectContext; deliverables[{id,mediaType,description,required,acceptance[]}]; requiredCapabilities[]; requiredAuthorities[]; freshnessRequirement=NONE|PREFERRED|CURRENT_REQUIRED; sourcePolicy={mode:any|official_only,scope:public_web|x,officialDomains:[]}; previewRequirement=NONE|PREFERRED|REQUIRED; deploymentRequirement=NONE|REQUESTED; risks[]; confidence 0..1; blockers[]; contextComplexity=low|medium|high|unknown.\n\nRegistered capabilities and request-time readiness:\n${JSON.stringify(availableSummary)}`;
  const interpretationInput: GoalInterpretationInput = {
    message: input.message,
    history: input.history ?? [],
    attachments: input.attachments ?? [],
    projectContext: input.projectContext ?? null,
    projectState: input.projectState,
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(interpretationInput) },
  ];
  const maximumOutputTokens = 1_500;
  const configuredTotalMs = Number(process.env.SEMANTIC_PLANNER_TOTAL_TIMEOUT_MS);
  const totalTimeoutMs = Number.isFinite(configuredTotalMs)
    ? Math.min(25_000, Math.max(5_000, configuredTotalMs))
    : 18_000;
  const totalController = new AbortController();
  const totalTimer = setTimeout(() => totalController.abort(), totalTimeoutMs);
  let lastStructuredFailure: RuntimeFailure | null = null;
  let finalModelId: ModelId | null = null;
  let correctionUsed = false;
  try {
    const planned = await executeWithProviderFallback({
      routes: models,
      timeoutMs: Math.min(9_000, totalTimeoutMs),
      maximumAttemptsPerRoute: 1,
      signal: totalController.signal,
      execute: async (modelId, signal) => {
        const goalContract = await resolveStructuredGoalContract(async (repairHint) => {
          if (repairHint) correctionUsed = true;
          const attemptMessages: ChatMessage[] = repairHint
            ? [...messages, { role: 'user', content: `Correct the previous planning output. ${repairHint}` }]
            : messages;
          const completion = await withProviderReservation({
            userId: input.userId,
            modelId,
            estimatedInputTokens: estimateMessageTokens(attemptMessages),
            maximumOutputTokens,
            purpose: 'complexity',
            execute: () => chatCompletion(modelId, attemptMessages, {
              maxTokens: maximumOutputTokens,
              temperature: 0,
              json: true,
              signal,
            }),
          });
          finalModelId = completion.modelId;
          await recordUsage(input.userId, completion.modelId, completion.inputTokens, completion.outputTokens);
          return completion.text;
        }, correctionUsed ? 0 : 1).catch((error) => {
          if (error instanceof RuntimeFailure) {
            lastStructuredFailure = error;
            recordModelValidation(modelId, false);
          }
          throw error;
        });
        recordModelValidation(modelId, true);
        return goalContract;
      },
    });
    const goalContract = planned.value;

    // The canonical build runtime owns an isolated validation sandbox. Exposing
    // that authority permits validation.run; it grants no deployment authority.
    const capabilityPlan = await planCapabilities({
      goal: goalContract,
      registry: universalCapabilityRegistry,
      authorities,
      select: async () => ({
        capabilityIds: goalContract.requiredCapabilities,
        rationale: 'Selected by the semantic interpreter from the live capability registry.',
      }),
    });
    const blockers = [
      ...unresolvedGoalBlockers(goalContract.blockers, authorities),
      ...capabilityPlan.rejected.map((item) => `${item.id}: ${item.reason}`),
    ];
    const usage = await getUsage(input.userId);
    const effectiveGoal = blockers.length ? goalContractSchema.parse({ ...goalContract, blockers }) : goalContract;
    return {
      goalContract: effectiveGoal,
      dispatch: blockers.length ? 'blocked' : dispatchForGoal(effectiveGoal, capabilityPlan.capabilities.map((item) => item.id)),
      capabilityIds: capabilityPlan.capabilities.map((item) => item.id),
      rationale: capabilityPlan.rationale,
      blockers,
      usage: usageToTokenUsage(usage),
    };
  } catch (error) {
    if (totalController.signal.aborted) {
      throw new RuntimeFailure('PLANNER_TIMEOUT', 'Xroga could not understand this request before the planning deadline. Please retry.', {
        cause: error,
        details: { totalTimeoutMs },
      });
    }
    if (lastStructuredFailure) throw lastStructuredFailure;
    const failures = (
      (error as { failures?: Array<{ kind?: string }> }).failures
      ?? (error instanceof RuntimeFailure && Array.isArray(error.details?.failures)
        ? error.details.failures as Array<{ kind?: string }>
        : [])
    );
    if (failures.some((failure) => failure.kind === 'timeout')) {
      throw new RuntimeFailure('PLANNER_TIMEOUT', 'The planning model timed out. Please retry this request.', { cause: error });
    }
    throw new RuntimeFailure('PLANNER_PROVIDER_UNAVAILABLE', 'The planning service is temporarily unavailable. Please retry.', {
      cause: error,
      details: { attemptedModels: models.length, finalModelId },
    });
  } finally {
    clearTimeout(totalTimer);
  }
}
