import { chatCompletion, estimateMessageTokens, type ChatMessage } from '../openaiCompat.js';
import { callableModelIds, type ModelId } from '../models.js';
import { withProviderReservation } from '../providerBudget.js';
import { recordUsage, usageToTokenUsage, type UsageSnapshot } from '../quota.js';
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

function selectInterpreterModel(env: NodeJS.ProcessEnv = process.env): ModelId {
  const callable = callableModelIds(env);
  for (const preferred of ['deepseek_v4_flash', 'glm_5_3_flash', 'glm_5_3', 'kimi_k3'] as const) {
    if (callable.includes(preferred)) return preferred;
  }
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
  if (goal.semanticIntent === 'MODIFY' || goal.semanticIntent === 'EXTERNAL_ACTION') return 'blocked';
  return 'chat';
}

export async function planSemanticRequest(input: {
  userId: string;
  message: string;
  history?: GoalInterpretationInput['history'];
  attachments?: GoalInterpretationInput['attachments'];
  projectContext?: GoalInterpretationInput['projectContext'];
  projectState?: GoalInterpretationInput['projectState'];
}): Promise<SemanticRequestPlan> {
  const modelId = selectInterpreterModel();
  const available = universalCapabilityRegistry.list();
  const availableSummary = available.map(({ id, title, description, effects, inputMediaTypes, outputMediaTypes }) => ({
    id, title, description, effects, inputMediaTypes, outputMediaTypes,
  }));
  const system = `Understand the user's current goal from the full conversation and context. Return strict JSON matching the supplied GoalContract schema. Do not use product modes, keyword categories, framework guesses, or a default website/build route. Choose the smallest set of registered capabilities that can genuinely produce the requested outcome. Read-only analysis must remain read-only. A project being present is context, not evidence of modification intent. If no registered capability can complete the goal, describe the missing capability in blockers instead of substituting a website or generic scaffold.\n\nGoalContract fields: version="1.0"; goal; desiredOutcome; semanticIntent=ANSWER|INVESTIGATE|PROPOSE|MODIFY|EXTERNAL_ACTION|MIXED; constraints[]; acceptance[]; historyContext[]; projectContext; deliverables[{id,mediaType,description,required,acceptance[]}]; requiredCapabilities[]; requiredAuthorities[]; risks[]; confidence 0..1; blockers[]; contextComplexity=low|medium|high|unknown.\n\nRegistered capabilities:\n${JSON.stringify(availableSummary)}`;
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
  const completion = await withProviderReservation({
    userId: input.userId,
    modelId,
    estimatedInputTokens: estimateMessageTokens(messages),
    maximumOutputTokens,
    purpose: 'complexity',
    execute: () => chatCompletion(modelId, messages, { maxTokens: maximumOutputTokens, temperature: 0, json: true }),
  });
  const fenced = completion.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = JSON.parse((fenced?.[1] ?? completion.text).trim());
  const goalContract = await interpretGoalContract(interpretationInput, async () => raw);
  // The canonical build runtime owns an isolated validation sandbox. Exposing
  // that authority to planning permits validation.run to be selected; it does
  // not grant repository, deployment, or external-account authority.
  const authorities = new Set<string>(['model:execute', 'sandbox:execute']);
  if (interpretationInput.attachments.length) authorities.add('attachment:read');
  if (interpretationInput.projectContext) {
    authorities.add('repository:read');
    authorities.add('repository:write');
  }
  if (process.env.PARALLEL_API_KEY) authorities.add('network:public-read');
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
    ...goalContract.blockers,
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
