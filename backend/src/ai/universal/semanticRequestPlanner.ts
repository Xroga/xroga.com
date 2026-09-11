import { chatCompletion, estimateMessageTokens, type ChatMessage } from '../openaiCompat.js';
import { callableModelIds, type ModelId } from '../models.js';
import { withProviderReservation } from '../providerBudget.js';
import { executeWithProviderFallback } from '../providerRuntime.js';
import { getUsage, recordUsage, usageToTokenUsage, type UsageSnapshot } from '../quota.js';
import { universalCapabilityRegistry } from '../../capabilities/index.js';
import { goalContractSchema, interpretGoalContract, type GoalContract, type GoalInterpretationInput } from './goalContract.js';
import { planCapabilities } from './planner.js';

export type UniversalDispatch = 'chat' | 'build' | 'blocked';

export interface SemanticRequestPlan {
  readonly goalContract: GoalContract;
  readonly dispatch: UniversalDispatch;
  readonly capabilityIds: readonly string[];
  readonly rationale: string;
  readonly blockers: readonly string[];
  readonly usage: ReturnType<typeof usageToTokenUsage>;
}

type RetiredDirectCapability = 'media-generation' | 'browser-automation';

/**
 * Stable product boundaries do not need a model call to rediscover them. This
 * classifier is deliberately narrow: it only recognizes direct requests for a
 * retired capability, and yields to any positive software-product build intent.
 * Image analysis from an attachment and browser verification inside a build are
 * separate, supported capabilities and are not matched here.
 */
export function retiredDirectCapability(message: string): RetiredDirectCapability | null {
  const withoutNegatedProjectWork = message.replace(
    /\b(?:do not|don't|without)\s+(?:build|change|modify|edit|create)[^.?!]*/gi,
    '',
  );
  const positiveSoftwareBuild =
    /\b(?:build|develop|implement|code|create|make)\b[\s\S]{0,100}\b(?:website|web\s*app|app|dashboard|extension|api|software|tool|project|site)\b/i;
  if (positiveSoftwareBuild.test(withoutNegatedProjectWork)) return null;

  const directMediaGeneration =
    /\b(?:generate|create|make|draw|render|produce|return)\b[\s\S]{0,80}\b(?:image|picture|photo|logo|thumbnail|poster|illustration|artwork|video|animation|gif)\b/i;
  if (directMediaGeneration.test(message)) return 'media-generation';

  const directBrowserAction =
    /\b(?:browser\s+automation|automate\s+(?:a\s+)?browser|browse\s+and\s+(?:click|fill|submit|purchase|book|apply)|(?:open|visit|navigate\s+to)\s+https?:\/\/|scrape\s+(?:this|the|a)\s+(?:site|website|page))\b/i;
  if (directBrowserAction.test(message)) return 'browser-automation';
  return null;
}

export async function planRetiredDirectCapability(input: {
  userId: string;
  message: string;
  projectContext?: GoalInterpretationInput['projectContext'];
}): Promise<SemanticRequestPlan | null> {
  const retired = retiredDirectCapability(input.message);
  if (!retired) return null;
  const media = retired === 'media-generation';
  const blocker = media
    ? 'Image and video generation are not available in Xroga. You can upload an image for analysis, or ask Xroga to build software that uses image assets.'
    : 'General-purpose browser automation is not available in Xroga. You can ask Xroga to research public sources or build and verify a web product.';
  const goalContract = goalContractSchema.parse({
    version: '1.0',
    goal: input.message,
    desiredOutcome: media ? 'Generate a media asset.' : 'Operate a third-party website in a browser.',
    semanticIntent: 'EXTERNAL_ACTION',
    constraints: ['Do not substitute an unrelated software build for an unavailable capability.'],
    acceptance: ['State the current product boundary truthfully and offer a supported alternative.'],
    historyContext: [],
    projectContext: input.projectContext ?? null,
    deliverables: [],
    requiredCapabilities: [],
    requiredAuthorities: [],
    risks: ['A fallback must not claim an external action or generated asset that did not occur.'],
    confidence: 1,
    blockers: [blocker],
    contextComplexity: 'low',
  });
  return {
    goalContract,
    dispatch: 'blocked',
    capabilityIds: [],
    rationale: 'The requested direct capability is outside the current product contract.',
    blockers: [blocker],
    usage: usageToTokenUsage(await getUsage(input.userId)),
  };
}

export function interpreterModelOrder(env: NodeJS.ProcessEnv = process.env): ModelId[] {
  const callable = callableModelIds(env);
  const ordered = (['deepseek_v4_flash', 'glm_5_3_flash', 'glm_5_3', 'kimi_k3'] as const)
    .filter((modelId) => callable.includes(modelId));
  if (ordered.length) return ordered;
  const error = new Error('No configured model is available to understand this request.');
  (error as Error & { code?: string }).code = 'SEMANTIC_PLANNER_UNAVAILABLE';
  throw error;
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

export async function planSemanticRequest(input: {
  userId: string;
  message: string;
  history?: GoalInterpretationInput['history'];
  attachments?: GoalInterpretationInput['attachments'];
  projectContext?: GoalInterpretationInput['projectContext'];
  projectState?: GoalInterpretationInput['projectState'];
}): Promise<SemanticRequestPlan> {
  const models = interpreterModelOrder();
  const available = universalCapabilityRegistry.list();
  const authorities = new Set<string>(['model:execute', 'sandbox:execute']);
  if (input.attachments?.length) authorities.add('attachment:read');
  if (input.projectContext) {
    authorities.add('repository:read');
    authorities.add('repository:write');
  }
  if (process.env.PARALLEL_API_KEY) authorities.add('network:public-read');
  const availableSummary = available.map(({ id, title, description, effects, requiredAuthorities, inputMediaTypes, outputMediaTypes }) => ({
    id, title, description, effects, requiredAuthorities, inputMediaTypes, outputMediaTypes,
  }));
  const system = `Understand the user's current goal from the full conversation and context. Return strict JSON matching the supplied GoalContract schema. Do not use product modes, keyword categories, framework guesses, or a default website/build route. Choose the smallest set of registered capabilities that can genuinely produce the requested outcome. Read-only analysis must remain read-only. A project being present is context, not evidence of modification intent. Authority availability is determined by the runtime, not by you. Never report a granted authority as missing. Use blockers only for essential missing user input or a genuinely unavailable capability. If no registered capability can complete the goal, describe the missing capability in blockers instead of substituting a website or generic scaffold.\n\nGranted authorities: ${JSON.stringify([...authorities])}.\n\nGoalContract fields: version="1.0"; goal; desiredOutcome; semanticIntent=ANSWER|INVESTIGATE|PROPOSE|MODIFY|EXTERNAL_ACTION|MIXED; constraints[]; acceptance[]; historyContext[]; projectContext; deliverables[{id,mediaType,description,required,acceptance[]}]; requiredCapabilities[]; requiredAuthorities[]; risks[]; confidence 0..1; blockers[]; contextComplexity=low|medium|high|unknown.\n\nRegistered capabilities:\n${JSON.stringify(availableSummary)}`;
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
  const maximumOutputTokens = 1_800;
  const planned = await executeWithProviderFallback({
    routes: models,
    timeoutMs: 45_000,
    maximumAttemptsPerRoute: 1,
    execute: async (modelId, signal) => {
      const completion = await withProviderReservation({
        userId: input.userId,
        modelId,
        estimatedInputTokens: estimateMessageTokens(messages),
        maximumOutputTokens,
        purpose: 'complexity',
        execute: () => chatCompletion(modelId, messages, { maxTokens: maximumOutputTokens, temperature: 0, json: true, signal }),
      });
      // A transport-level 200 is not a usable planning result. Keep schema parsing
      // inside the provider attempt so malformed or incomplete structured output
      // falls through to the next approved model instead of aborting the entire
      // universal request before another provider gets a chance.
      const fenced = completion.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const raw = JSON.parse((fenced?.[1] ?? completion.text).trim());
      const goalContract = await interpretGoalContract(interpretationInput, async () => raw);
      return { completion, goalContract };
    },
  });
  const { completion, goalContract } = planned.value;
  // The canonical build runtime owns an isolated validation sandbox. Exposing
  // that authority to planning permits validation.run to be selected; it does
  // not grant repository, deployment, or external-account authority.
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
  const usage: UsageSnapshot = await recordUsage(input.userId, completion.modelId, completion.inputTokens, completion.outputTokens);
  const effectiveGoal = blockers.length ? goalContractSchema.parse({ ...goalContract, blockers }) : goalContract;
  return {
    goalContract: effectiveGoal,
    dispatch: blockers.length ? 'blocked' : dispatchForGoal(effectiveGoal, capabilityPlan.capabilities.map((item) => item.id)),
    capabilityIds: capabilityPlan.capabilities.map((item) => item.id),
    rationale: capabilityPlan.rationale,
    blockers,
    usage: usageToTokenUsage(usage),
  };
}
