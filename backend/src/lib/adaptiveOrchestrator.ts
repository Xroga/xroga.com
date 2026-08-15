import { MODELS, type ModelId } from '../ai/models.js';
import { routePrompt } from '../ai/router.js';
import { getCapabilityRegistry, type CapabilityDefinition } from './capabilityRegistry.js';
import { resolveHealthyProvider, type ProviderCandidate } from './providerResolver.js';
import { selectStorageProvider, type StorageProviderState, type StorageSelection } from './storageSelection.js';
import { classifyTaskRequest, type TaskClassification } from './taskClassifier.js';

export interface ProjectContext {
  existingStorage?: StorageProviderState[];
  availableStorage?: StorageProviderState[];
  modelProviders?: ProviderCandidate[];
  repositoryPresent?: boolean;
}

export interface AdaptiveSubtask {
  id: string;
  operation: string;
  dependsOn: string[];
  capabilityIds: string[];
  status: 'ready' | 'blocked';
  blocker?: string;
}

export interface AdaptiveExecutionPlan {
  status: 'ready' | 'blocked';
  classification: TaskClassification;
  capabilities: CapabilityDefinition[];
  route: {
    kind: string;
    primaryModel: ModelId | null;
    reviewerModel: ModelId | null;
    research: boolean;
    reason: string;
  };
  storage?: StorageSelection;
  subtasks: AdaptiveSubtask[];
  blockers: string[];
}

const MODEL_FALLBACKS: Record<ModelId, ModelId[]> = {
  kimi_k2_7: ['glm_5_2', 'kimi_k3', 'deepseek_v4_pro'],
  kimi_k3: ['glm_5_2', 'deepseek_v4_pro', 'grok_4_3'],
  glm_5_2: ['kimi_k3', 'grok_4_3', 'deepseek_v4_pro'],
  deepseek_v4_pro: ['kimi_k3', 'glm_5_2', 'deepseek_v4_flash'],
  deepseek_v4_flash: ['deepseek_v4_pro', 'grok_4_3', 'kimi_k3'],
  grok_4_5: ['grok_4_3', 'kimi_k3', 'deepseek_v4_flash'],
  grok_4_3: ['glm_5_2', 'kimi_k3', 'deepseek_v4_pro'],
};

function modelCandidates(
  primary: ModelId,
  env: NodeJS.ProcessEnv,
  supplied?: ProviderCandidate[],
): ProviderCandidate[] {
  if (supplied?.length) return supplied;
  return [primary, ...MODEL_FALLBACKS[primary]].map((id, index) => ({
    id,
    configured: Boolean(env[MODELS[id].secretKey]?.trim()),
    healthy: undefined,
    supports: ['generate'],
    priority: index,
    failureReason: 'runtime health not verified',
  }));
}

function reviewerFor(primary: ModelId, candidates: ProviderCandidate[], highRisk: boolean): ModelId | null {
  if (!highRisk) return null;
  const resolution = resolveHealthyProvider(
    'review',
    candidates.map((candidate) => ({
      ...candidate,
      supports: [...new Set([...candidate.supports, 'review'])],
    })),
  );
  if (!resolution.selected || resolution.selected === primary) {
    return (candidates.find(
      (candidate) => candidate.id !== primary && candidate.configured && candidate.healthy === true,
    )?.id as ModelId | undefined) ?? null;
  }
  return resolution.selected as ModelId;
}

export function createAdaptiveExecutionPlan(
  prompt: string,
  context = '',
  project: ProjectContext = {},
  env: NodeJS.ProcessEnv = process.env,
): AdaptiveExecutionPlan {
  const classification = classifyTaskRequest(prompt, context);
  const registry = getCapabilityRegistry(env);
  const capabilities = classification.requiredCapabilities
    .map((id) => registry.find((entry) => entry.id === id))
    .filter((entry): entry is CapabilityDefinition => Boolean(entry));
  const route = routePrompt(prompt);
  const candidates = modelCandidates(route.builder, env, project.modelProviders);
  const model = resolveHealthyProvider('generate', candidates, route.builder);
  const blockers: string[] = [];
  if (model.status === 'blocked' && model.blocker) blockers.push(model.blocker);

  const needsStorage = classification.requiredCapabilities.includes('database_integration');
  const storage = needsStorage
    ? selectStorageProvider({
        request: prompt,
        existingProviders: project.existingStorage,
        availableProviders: project.availableStorage,
      })
    : undefined;
  if (storage?.status === 'blocked' && storage.blocker) blockers.push(storage.blocker);

  const highRisk = classification.requiredCapabilities.some((id) =>
    ['security_review', 'payment_integration', 'authentication_integration', 'deployment'].includes(id),
  );
  const reviewerModel = reviewerFor(route.builder, candidates, highRisk);
  if (highRisk && !reviewerModel) {
    blockers.push('A distinct healthy review model is required for this high-risk operation.');
  }
  const subtasks: AdaptiveSubtask[] = [
    {
      id: 'understand',
      operation: project.repositoryPresent ? 'inspect_repository' : 'understand_request',
      dependsOn: [],
      capabilityIds: project.repositoryPresent ? ['repository_operations'] : [],
      status: 'ready',
    },
  ];
  if (classification.requiresResearch) {
    subtasks.push({
      id: 'research',
      operation: 'gather_current_evidence',
      dependsOn: ['understand'],
      capabilityIds: ['web_research'],
      status: 'ready',
    });
  }
  subtasks.push({
    id: 'execute',
    operation: classification.primaryIntent,
    dependsOn: classification.requiresResearch ? ['research'] : ['understand'],
    capabilityIds: classification.requiredCapabilities,
    status: model.status === 'selected' && storage?.status !== 'blocked' ? 'ready' : 'blocked',
    blocker: blockers[0],
  });
  subtasks.push({
    id: 'validate',
    operation: 'validate_outcome',
    dependsOn: ['execute'],
    capabilityIds: ['testing'],
    status: blockers.length ? 'blocked' : 'ready',
    blocker: blockers[0],
  });
  if (highRisk) {
    subtasks.push({
      id: 'review',
      operation: 'independent_review',
      dependsOn: ['validate'],
      capabilityIds: ['security_review'],
      status: blockers.length ? 'blocked' : 'ready',
      blocker: blockers[0],
    });
  }

  return {
    status: blockers.length ? 'blocked' : 'ready',
    classification,
    capabilities,
    route: {
      kind: route.kind,
      primaryModel: model.selected as ModelId | null,
      reviewerModel,
      research: route.useResearch,
      reason: model.reason,
    },
    storage,
    subtasks,
    blockers,
  };
}
