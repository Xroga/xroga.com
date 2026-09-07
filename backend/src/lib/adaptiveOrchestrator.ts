import {
  MODELS,
  type ModelId,
} from '../ai/models.js';

import {
  isCodingModel,
} from '../ai/providerPolicy.js';

import {
  routePrompt,
} from '../ai/router.js';

import {
  getCapabilityRegistry,
  type CapabilityDefinition,
} from './capabilityRegistry.js';

import {
  resolveHealthyProvider,
  type ProviderCandidate,
} from './providerResolver.js';

import {
  selectStorageProvider,
  type StorageProviderState,
  type StorageSelection,
} from './storageSelection.js';

import {
  classifyTaskRequest,
  type TaskClassification,
} from './taskClassifier.js';

export interface ProjectContext {
  existingStorage?: StorageProviderState[];
  availableStorage?: StorageProviderState[];

  /**
   * Internal/test injection only.
   *
   * Public HTTP routes must not trust the browser to claim
   * that a model is configured or healthy.
   */
  modelProviders?: ProviderCandidate[];

  repositoryPresent?: boolean;
}

export interface AdaptiveSubtask {
  id: string;
  operation: string;
  dependsOn: string[];
  capabilityIds: string[];

  status:
    | 'ready'
    | 'blocked';

  blocker?: string;
}

export interface AdaptiveExecutionPlan {
  status:
    | 'ready'
    | 'blocked';

  classification:
    TaskClassification;

  capabilities:
    CapabilityDefinition[];

  route: {
    kind: string;

    primaryModel:
      ModelId | null;

    reviewerModel:
      ModelId | null;

    research: boolean;

    reason: string;
  };

  storage?: StorageSelection;

  subtasks:
    AdaptiveSubtask[];

  blockers: string[];
}

const MODEL_FALLBACKS: Record<
  ModelId,
  ModelId[]
> = {
  kimi_k2_7: [
    'glm_5_3_flash',
    'glm_5_3',
    'kimi_k3',
    'deepseek_v4_pro',
  ],

  kimi_k3: [
    'glm_5_3',
    'glm_5_3_flash',
    'glm_5_2',
    'deepseek_v4_pro',
  ],

  glm_5_2: [
    'glm_5_3',
    'glm_5_3_flash',
    'kimi_k3',
    'deepseek_v4_pro',
  ],

  glm_5_3: [
    'glm_5_3_flash',
    'kimi_k3',
    'glm_5_2',
    'deepseek_v4_pro',
  ],

  glm_5_3_flash: [
    'glm_5_3',
    'kimi_k3',
    'glm_5_2',
    'deepseek_v4_flash',
  ],

  deepseek_v4_pro: [
    'glm_5_3_flash',
    'glm_5_3',
    'deepseek_v4_flash',
    'kimi_k3',
  ],

  deepseek_v4_flash: [
    'glm_5_3_flash',
    'deepseek_v4_pro',
    'glm_5_3',
    'kimi_k3',
  ],

  /**
   * Temporary research-only compatibility.
   *
   * Neither chain can cross into engineering because
   * providerPolicy refuses Grok as a coding model.
   */
  grok_4_5: [
    'grok_4_3',
  ],

  grok_4_3: [
    'grok_4_5',
  ],
};

function configuredFor(
  id: ModelId,
  env: NodeJS.ProcessEnv,
): boolean {
  const def =
    MODELS[id];

  if (
    def.provider === 'xai'
  ) {
    return Boolean(
      env.XAI_API_KEY?.trim() ||
        env.GROK_API_KEY?.trim(),
    );
  }

  return Boolean(
    env[
      def.secretKey
    ]?.trim(),
  );
}

function modelCandidates(
  primary: ModelId,
  env: NodeJS.ProcessEnv,
  supplied?: ProviderCandidate[],
): ProviderCandidate[] {
  const chain: ModelId[] = [
    primary,
    ...MODEL_FALLBACKS[
      primary
    ],
  ];

  const allowed =
    new Set<ModelId>(
      chain,
    );

  /**
   * Supplied candidates are useful for internal tests and
   * server-controlled orchestration.
   *
   * Never allow them to widen the declared fallback chain.
   */
  if (supplied?.length) {
    return supplied.filter(
      (candidate) => {
        if (
          !(
            candidate.id in
            MODELS
          )
        ) {
          return false;
        }

        const id =
          candidate.id as
            ModelId;

        if (
          !allowed.has(id)
        ) {
          return false;
        }

        /**
         * Every current generic synthesis/engineering primary
         * is a coding-authorized model. This prevents a supplied
         * Grok candidate from entering that chain.
         */
        if (
          isCodingModel(
            primary,
          ) &&
          !isCodingModel(id)
        ) {
          return false;
        }

        return true;
      },
    );
  }

  return chain.map(
    (id, index) => ({
      id,

      configured:
        configuredFor(
          id,
          env,
        ),

      healthy: undefined,

      supports: [
        'generate',
      ],

      priority: index,

      failureReason:
        'runtime health not verified',
    }),
  );
}

function reviewerFor(
  primary: ModelId,
  candidates: ProviderCandidate[],
  highRisk: boolean,
): ModelId | null {
  if (!highRisk) {
    return null;
  }

  const reviewerCandidates =
    candidates
      .filter(
        (candidate) =>
          candidate.id !==
            primary &&
          isCodingModel(
            candidate.id,
          ),
      )
      .map(
        (candidate) => ({
          ...candidate,

          supports: [
            ...new Set([
              ...candidate.supports,
              'review',
            ]),
          ],
        }),
      );

  const resolution =
    resolveHealthyProvider(
      'review',
      reviewerCandidates,
    );

  if (
    !resolution.selected
  ) {
    return null;
  }

  return resolution.selected as
    ModelId;
}

export function createAdaptiveExecutionPlan(
  prompt: string,
  context = '',
  project: ProjectContext = {},
  env: NodeJS.ProcessEnv =
    process.env,
): AdaptiveExecutionPlan {
  const classification =
    classifyTaskRequest(
      prompt,
      context,
    );

  const registry =
    getCapabilityRegistry(
      env,
    );

  const capabilities =
    classification.requiredCapabilities
      .map(
        (id) =>
          registry.find(
            (entry) =>
              entry.id === id,
          ),
      )
      .filter(
        (
          entry,
        ): entry is CapabilityDefinition =>
          Boolean(entry),
      );

  const route =
    routePrompt(prompt);

  const candidates =
    modelCandidates(
      route.builder,
      env,
      project.modelProviders,
    );

  const model =
    resolveHealthyProvider(
      'generate',
      candidates,
      route.builder,
    );

  const blockers:
    string[] = [];

  if (
    model.status ===
      'blocked' &&
    model.blocker
  ) {
    blockers.push(
      model.blocker,
    );
  }

  const needsStorage =
    classification.requiredCapabilities.includes(
      'database_integration',
    );

  const storage =
    needsStorage
      ? selectStorageProvider({
          request: prompt,

          existingProviders:
            project.existingStorage,

          availableProviders:
            project.availableStorage,
        })
      : undefined;

  if (
    storage?.status ===
      'blocked' &&
    storage.blocker
  ) {
    blockers.push(
      storage.blocker,
    );
  }

  const highRisk =
    classification.requiredCapabilities.some(
      (id) =>
        [
          'security_review',
          'payment_integration',
          'authentication_integration',
          'deployment',
        ].includes(id),
    );

  const selectedPrimary =
    model.selected
      ? (model.selected as
          ModelId)
      : null;

  const reviewerModel =
    selectedPrimary
      ? reviewerFor(
          selectedPrimary,
          candidates,
          highRisk,
        )
      : null;

  if (
    highRisk &&
    !reviewerModel
  ) {
    blockers.push(
      'A distinct healthy review model is required for this high-risk operation.',
    );
  }

  const subtasks:
    AdaptiveSubtask[] = [
      {
        id: 'understand',

        operation:
          project.repositoryPresent
            ? 'inspect_repository'
            : 'understand_request',

        dependsOn: [],

        capabilityIds:
          project.repositoryPresent
            ? [
                'repository_operations',
              ]
            : [],

        status: 'ready',
      },
    ];

  if (
    classification.requiresResearch
  ) {
    const researchCapability =
      classification.requiredCapabilities.includes(
        'x_research',
      )
        ? 'x_research'
        : 'web_research';

    subtasks.push({
      id: 'research',

      operation:
        'gather_current_evidence',

      dependsOn: [
        'understand',
      ],

      capabilityIds: [
        researchCapability,
      ],

      status: 'ready',
    });
  }

  subtasks.push({
    id: 'execute',

    operation:
      classification.primaryIntent,

    dependsOn:
      classification.requiresResearch
        ? ['research']
        : ['understand'],

    capabilityIds:
      classification.requiredCapabilities,

    status:
      model.status ===
        'selected' &&
      storage?.status !==
        'blocked'
        ? 'ready'
        : 'blocked',

    blocker:
      blockers[0],
  });

  subtasks.push({
    id: 'validate',

    operation:
      'validate_outcome',

    dependsOn: [
      'execute',
    ],

    capabilityIds: [
      'testing',
    ],

    status:
      blockers.length
        ? 'blocked'
        : 'ready',

    blocker:
      blockers[0],
  });

  if (highRisk) {
    subtasks.push({
      id: 'review',

      operation:
        'independent_review',

      dependsOn: [
        'validate',
      ],

      capabilityIds: [
        'security_review',
      ],

      status:
        blockers.length
          ? 'blocked'
          : 'ready',

      blocker:
        blockers[0],
    });
  }

  return {
    status:
      blockers.length
        ? 'blocked'
        : 'ready',

    classification,

    capabilities,

    route: {
      kind: route.kind,

      primaryModel:
        selectedPrimary,

      reviewerModel,

      research:
        route.useResearch,

      reason:
        model.reason,
    },

    storage,

    subtasks,

    blockers,
  };
}
