import {
  chatCompletion,
  estimateMessageTokens,
  type ChatMessage,
} from '../openaiCompat.js';

import {
  callableModelIds,
  MODELS,
  type ModelId,
} from '../models.js';
import { getRouterAdminConfig } from '../routerConfig.js';
import { PRESENTATION_PLAN_INSTRUCTIONS } from '../responsePresentation.js';
import {prepareSonnetConversation,requestedSonnetReason} from '../sonnetApproval.js';

import {
  withTenantModelReservation,
} from '../tenantModelDispatch.js';
import { requireTenantContext, requireResourceOwner, type TenantContext } from '../../security/tenantContext.js';

import {
  executeWithProviderFallback,
  isTerminalModelFailure,
  getModelRuntimeHealth,
  recordModelValidation,
  type ModelRuntimeHealth,
} from '../providerRuntime.js';

import {
  getUsage,
  usageToTokenUsage,
} from '../quota.js';

import {
  universalCapabilityRegistry,
} from '../../capabilities/index.js';

import {
  generateStructured,
} from '../black-hole/structuredOutput.js';

import {
  explicitExecutionControls,
  goalContractSchema,
  normalizeGoalContractCandidate,
  normalizePlannerDecisionCandidate,
  type GoalContract,
  type GoalInterpretationInput,
} from './goalContract.js';

import {
  planCapabilities,
} from './planner.js';

import {
  currentProductTruth,
} from './productTruth.js';

import {
  RuntimeFailure,
} from './runtimeFailure.js';

import {
  getGitHubToken,
} from '../../services/integrations/githubAuth.js';

import {
  splitExplicitBusinessWorkflow,
} from '../../services/integrations/businessWorkflow.js';

export type UniversalDispatch =
  | 'chat'
  | 'build'
  | 'blocked';

export interface SemanticRequestPlan {
  readonly goalContract:
    GoalContract;

  readonly dispatch:
    UniversalDispatch;

  readonly capabilityIds:
    readonly string[];

  readonly rationale:
    string;

  readonly blockers:
    readonly string[];

  readonly usage:
    ReturnType<
      typeof usageToTokenUsage
    >;

  /**
   * Completes a bounded social protocol
   * turn without a second model call.
   */
  readonly directResponse?:
    string;
}

/** A calculator composed in the answer uses local presentation state. A
 * software deliverable, project control or external action keeps its own route. */
export function enforceInlineCalculatorIntent(
  goal: GoalContract,
  { message, attachments }: Pick<GoalInterpretationInput, 'message' | 'attachments'>,
): GoalContract {
  const capabilities = goal.requiredCapabilities;
  if (
    (goal.semanticIntent !== 'MODIFY' && goal.semanticIntent !== 'ANSWER') ||
    !capabilities.includes('software.implement') ||
    capabilities.some(id => !['software.implement', 'validation.run', 'attachment.analyze', 'conversation.respond'].includes(id)) ||
    goal.blockers.length || goal.projectContext || goal.previewRequirement === 'REQUIRED' ||
    goal.publicationRequirement !== 'NONE' || goal.deploymentRequirement !== 'NONE'
  ) return goal;

  const inAnswer = /\b(?:in|within)\s+(?:this |the |your )?(?:answer|chat|response)\b/i.test(message);
  const adjustable = /\b(?:sliders?|adjustable inputs?)\b/i.test(message);
  const structuredData = /\b(?:charts?|tables?|tabulate)\b/i.test(message);
  const softwareOrAction = /\b(?:apps?|websites?|webpages?|repos?|repositor(?:y|ies)|pull requests?|code|react|next\.js|html|css|javascript|typescript|preview|deploy\w*|publish\w*|install\w*|integrate\w*|save|send|email|upload|delete|commit)\b/i.test(message);
  if (softwareOrAction || !/\bcalculator\b/i.test(message) || !adjustable ||
      (!inAnswer && !(attachments.length && structuredData))) return goal;

  return {
    ...goal,
    semanticIntent: 'ANSWER',
    previewRequirement: 'NONE',
    requiredCapabilities: ['conversation.respond', ...(attachments.length ? ['attachment.analyze'] : [])],
  };
}

/**
 * Final API-boundary invariant for explicit product controls.
 *
 * The model remains responsible for semantic interpretation. The server owns
 * execution safety: Xroga Connect cannot satisfy a requested project Preview,
 * so an otherwise schema-valid Connect plan is converted to the canonical
 * software execution capability set before it can reach an external tool.
 */
export function enforceExplicitExecutionControls(
  plan: SemanticRequestPlan,
  message: string,
): SemanticRequestPlan {
  const controls =
    explicitExecutionControls(
      message,
    );

  if (
    controls.previewRequirement !==
      'REQUIRED' ||
    plan.dispatch ===
      'blocked'
  ) {
    return plan;
  }

  const capabilityIds = [
    ...new Set([
      ...plan.capabilityIds.filter(
        (id) =>
          id !== 'business.action' &&
          id !== 'business.read' &&
          id !== 'conversation.respond',
      ),

      'software.implement',
      'validation.run',

      ...(plan.goalContract
        .projectContext
        ? [
            'repository.read',
            'repository.write',
          ]
        : []),
    ]),
  ];

  const requiredAuthorities = [
    ...new Set(
      capabilityIds.flatMap(
        (id) =>
          universalCapabilityRegistry
            .get(
              id,
            )
            ?.requiredAuthorities ??
          [],
      ),
    ),
  ];

  const goalContract =
    goalContractSchema.parse({
      ...plan.goalContract,
      semanticIntent:
        'MODIFY',
      previewRequirement:
        'REQUIRED',
      deploymentRequirement:
        controls.deploymentForbidden
          ? 'NONE'
          : plan.goalContract
              .deploymentRequirement,
      requiredCapabilities:
        capabilityIds,
      requiredAuthorities,
    });

  return {
    ...plan,
    goalContract,
    dispatch:
      'build',
    capabilityIds,
    rationale:
      'An explicit project Preview requires the canonical software implementation and validation runtime.',
    blockers: [],
    directResponse:
      undefined,
  };
}

/**
 * A request to search the public web is not a request to inspect a connected
 * business account. Keep this narrow guard at the API boundary so a planner
 * mistake cannot send travel or other public research into Composio.
 */
export function enforceExplicitPublicResearchControls(
  plan: SemanticRequestPlan,
  message: string,
): SemanticRequestPlan {
  const explicitSearch =
    /\b(?:web searches?|internet searches?|search (?:the )?(?:web|internet)|browse (?:the )?(?:web|internet)|research online)\b/i.test(message);
  const negatedSearch =
    /\b(?:do not|don't|without|avoid)\s+(?:\w+\s+){0,2}(?:web searches?|internet searches?|search (?:the )?(?:web|internet)|browse (?:the )?(?:web|internet)|research online)\b/i.test(message);
  const followedByAppAction =
    /\b(?:and|then|also)\s+(?:please\s+)?(?:send|email|message|create|schedule|book|update|edit|delete|remove|publish|post|upload|invite|refund|transfer|pay)\b/i.test(message);

  if (explicitSearch && !negatedSearch && followedByAppAction && plan.dispatch === 'chat') {
    const blockers = ['Public-web research followed by a connected-app action needs a reviewed multi-source workflow; no action was executed.'];
    return {
      ...plan,
      dispatch: 'blocked',
      blockers,
      rationale: 'Do not silently drop either task or pass untrusted web results into an external action.',
      goalContract: goalContractSchema.parse({ ...plan.goalContract, blockers }),
      directResponse: undefined,
    };
  }

  if (
    !explicitSearch ||
    negatedSearch ||
    plan.dispatch !== 'chat' ||
    [...plan.capabilityIds, ...plan.goalContract.requiredCapabilities].some(
      (id) => id === 'business.action' || id === 'software.implement',
    )
  ) {
    return plan;
  }

  const capabilityIds = [
    ...new Set([
      ...plan.capabilityIds.filter((id) => id !== 'business.read'),
      'research.public-web',
      'conversation.respond',
    ]),
  ];
  const researchReady =
    universalCapabilityRegistry.get('research.public-web')?.health() === 'available';
  const blockers = researchReady
    ? []
    : ['Public web research is unavailable because its provider is not configured.'];

  const goalContract = goalContractSchema.parse({
    ...plan.goalContract,
    semanticIntent: 'INVESTIGATE',
    requiredCapabilities: capabilityIds,
    requiredAuthorities: [
      ...new Set(
        capabilityIds.flatMap(
          (id) => universalCapabilityRegistry.get(id)?.requiredAuthorities ?? [],
        ),
      ),
    ],
    freshnessRequirement: 'CURRENT_REQUIRED',
    sourcePolicy: {
      ...plan.goalContract.sourcePolicy,
      scope: 'public_web',
    },
    blockers,
  });

  return {
    ...plan,
    goalContract,
    dispatch: researchReady ? 'chat' : 'blocked',
    capabilityIds,
    rationale: 'The user explicitly requested public web research, not a connected-app read.',
    blockers,
    directResponse: undefined,
  };
}

/** Preserve each explicit connected-app task even if the model collapsed a
 * multi-app request into one read or one action capability. */
export function enforceExplicitBusinessWorkflowControls(
  plan: SemanticRequestPlan,
  message: string,
): SemanticRequestPlan {
  if (
    plan.dispatch !== 'chat' ||
    !plan.capabilityIds.some((id) => id === 'business.read' || id === 'business.action') ||
    [...plan.capabilityIds, ...plan.goalContract.requiredCapabilities].some(
      (id) => id === 'software.implement' || id === 'research.public-web',
    )
  ) return plan;

  const steps = splitExplicitBusinessWorkflow(message);
  if (!steps) return plan;

  const capabilities = [
    ...new Set([
      ...plan.capabilityIds,
      ...(steps.some((step) => step.kind === 'read') ? ['business.read'] : []),
      'business.action',
    ]),
  ];
  const unavailable = capabilities.filter((id) => universalCapabilityRegistry.get(id)?.health() !== 'available');
  const blockers = unavailable.length ? [`Connected-app workflow is unavailable: ${unavailable.join(', ')}.`] : [];
  const goalContract = goalContractSchema.parse({
    ...plan.goalContract,
    semanticIntent: steps.some((step) => step.kind === 'read') ? 'MIXED' : 'EXTERNAL_ACTION',
    requiredCapabilities: capabilities,
    requiredAuthorities: [
      ...new Set(capabilities.flatMap((id) => universalCapabilityRegistry.get(id)?.requiredAuthorities ?? [])),
    ],
    blockers,
  });
  return {
    ...plan,
    goalContract,
    capabilityIds: capabilities,
    dispatch: blockers.length ? 'blocked' : 'chat',
    blockers,
    rationale: 'Preserved all explicit connected-app tasks in the user request.',
    directResponse: undefined,
  };
}

export const SEMANTIC_PLANNER_DEFAULT_TOTAL_TIMEOUT_MS =
  28_000;

export const SEMANTIC_PLANNER_MAX_TOTAL_TIMEOUT_MS =
  30_000;

export const SEMANTIC_PLANNER_ROUTE_TIMEOUT_MS =
  28_000;

export const SEMANTIC_PLANNER_HEDGE_DELAY_MS =
  4_000;

/**
 * The planner needs a compact JSON
 * decision, not a private reasoning
 * transcript.
 */
export function semanticPlannerCompletionOptions(
  signal: AbortSignal,
) {
  return {
    maxTokens: 1_500,

    temperature: 0,

    json: true,

    reasoningMode:
      'none' as const,

    signal,
  };
}

/** Compatibility entry point over the existing canonical executor. One
 * admitted DeepSeek request, no hedge, replay or cross-model substitution. */
export async function executeHedgedPlannerFallback<T>(input:{routes:readonly ModelId[];execute:(modelId:ModelId,signal:AbortSignal)=>Promise<T>;
  signal:AbortSignal;routeTimeoutMs:number;hedgeDelayMs?:number}):Promise<{value:T;modelId:ModelId}>{
  const primary=input.routes[0];
  if(primary!=='deepseek_v4_1_flash_1017')throw Object.assign(new Error('The semantic planner requires the approved default model.'),{code:'MODEL_DESTINATION_DENIED'});
  const result=await executeWithProviderFallback({routes:[primary],execute:input.execute,signal:input.signal,
    timeoutMs:Math.min(input.routeTimeoutMs,SEMANTIC_PLANNER_MAX_TOTAL_TIMEOUT_MS),maximumAttemptsPerRoute:1});
  return {value:result.value,modelId:result.modelId};
}

export function interpreterModelOrder(
  env:
    NodeJS.ProcessEnv =
      process.env,
): ModelId[] {
  const callable =
    callableModelIds(
      env,
    );
  const policy = getRouterAdminConfig(env);

  const ordered =
    (
      ['deepseek_v4_1_flash_1017'] as const
    )
      .filter(
        (modelId) =>
          policy.enabledProviders.includes(MODELS[modelId].provider) && policy.allowedModels.includes(modelId) && callable.includes(
            modelId,
          ),
      );

  if (
    ordered.length
  ) {
    return ordered;
  }

  throw new RuntimeFailure(
    'PLANNER_PROVIDER_UNAVAILABLE',

    'No configured model is currently available to understand this request.',
  );
}

export function selectPlannerRoutes(
  env:
    NodeJS.ProcessEnv =
      process.env,

  healthFor: (
    modelId: ModelId,
  ) => Pick<
    ModelRuntimeHealth,
    'status'
  > =
    getModelRuntimeHealth,
): ModelId[] {
  const routes =
    interpreterModelOrder(
      env,
    )
      .filter(
        (modelId) =>
          healthFor(
            modelId,
          ).status !==
          'circuit_open',
      )
      .slice(
        0,
        2,
      );

  if (
    routes.length
  ) {
    return routes;
  }

  throw new RuntimeFailure(
    'PLANNER_PROVIDER_UNAVAILABLE',

    'Planning providers are temporarily cooling down. Please retry shortly.',
  );
}

const SOCIAL_GREETING_HEAD =
  /^(?:hi|hello(?:\s+there)?|hey(?:\s+there)?|howdy|hola|good\s+(?:morning|afternoon|evening))\b/i;

const SOCIAL_GREETING_TAIL =
  /^(?:[!.,\s]*|\s*(?:—|–|-|,)\s*(?:(?:i(?:'m|\s+am)\s+)?(?:glad|happy|pleased)\s+to\s+(?:be\s+here|meet\s+you|connect)|(?:it(?:'s|\s+is)\s+)?nice\s+to\s+(?:meet\s+you|connect)|hope\s+(?:you(?:'re|\s+are)\s+well|all\s+is\s+well))[!.,\s]*)$/i;

const SOCIAL_ACKNOWLEDGEMENT =
  /^(?:thanks|thank\s+you|thank\s+you\s+very\s+much|okay|ok|got\s+it|bye|goodbye)[!.,\s]*$/i;

/**
 * A deliberately tiny protocol
 * optimization, never an intent router.
 */
export function protocolSocialResponse(
  message: string,
  hasAttachments = false,
): string | null {
  if (
    hasAttachments
  ) {
    return null;
  }

  const normalized =
    message.trim();

  if (
    !normalized ||
    normalized.includes(
      '?',
    )
  ) {
    return null;
  }

  const greeting =
    normalized.match(
      SOCIAL_GREETING_HEAD,
    );

  if (
    greeting &&
    SOCIAL_GREETING_TAIL.test(
      normalized.slice(
        greeting[0].length,
      ),
    )
  ) {
    return 'Hey! 👋 What can I help you accomplish today?';
  }

  if (
    SOCIAL_ACKNOWLEDGEMENT.test(
      normalized,
    )
  ) {
    return /bye|goodbye/i.test(
      normalized,
    )
      ? 'See you soon!'
      : 'You’re welcome!';
  }

  return null;
}

export async function planProtocolSocialTurn(
  input: {
    userId: string;

    message: string;

    attachments?:
      GoalInterpretationInput[
        'attachments'
      ];
  },
): Promise<
  | SemanticRequestPlan
  | null
> {
  const directResponse =
    protocolSocialResponse(
      input.message,

      Boolean(
        input.attachments
          ?.length,
      ),
    );

  if (
    !directResponse
  ) {
    return null;
  }

  const goalContract =
    goalContractSchema.parse(
      {
        version: '1.0',

        goal:
          input.message,

        desiredOutcome:
          'A brief conversational acknowledgement.',

        semanticIntent:
          'ANSWER',

        constraints: [
          'Do not start tools, repository work, web retrieval, Preview, deployment, or connected-app actions.',
        ],

        acceptance: [
          'Respond immediately and briefly.',
        ],

        historyContext:
          [],

        projectContext:
          null,

        deliverables:
          [],

        requiredCapabilities: [
          'conversation.respond',
        ],

        requiredAuthorities:
          [],

        risks:
          [],

        confidence:
          1,

        blockers:
          [],

        contextComplexity:
          'low',
      },
    );

  return {
    goalContract,

    dispatch:
      'chat',

    capabilityIds: [
      'conversation.respond',
    ],

    rationale:
      'Completed by the bounded social protocol path without execution side effects.',

    blockers: [],

    usage:
      usageToTokenUsage(
        await getUsage(
          input.userId,
        ),
      ),

    directResponse,
  };
}

export async function resolveStructuredGoalContract(
  attempt: (
    repairHint?: string,
  ) => Promise<string>,

  maxRepairs = 0,

  normalize: (
    value: unknown,
  ) => unknown =
    normalizeGoalContractCandidate,
): Promise<GoalContract> {
  const generated =
    await generateStructured<GoalContract>(
      {
        maxRepairs,

        attempt,

        validate: (
          value,
        ) => {
          const parsed =
            goalContractSchema
              .safeParse(
                normalize(
                  value,
                ),
              );

          if (
            parsed.success &&
            parsed.data
              .requiredCapabilities
              .length ===
              0
          ) {
            return {
              valid: false,

              error:
                'requiredCapabilities must contain at least one registered capability id',
            };
          }

          if (
            parsed.success
          ) {
            const coherenceError =
              plannerContractCoherenceError(
                parsed.data,
              );

            if (
              coherenceError
            ) {
              return {
                valid: false,

                error:
                  coherenceError,
              };
            }
          }

          return parsed.success
            ? {
                valid: true,

                value:
                  parsed.data,
              }
            : {
                valid: false,

                error:
                  parsed.error
                    .issues
                    .map(
                      (issue) =>
                        issue.message,
                    )
                    .join(
                      '; ',
                    ),
              };
        },
      },
    );

  if (
    generated.ok
  ) {
    return generated.value;
  }

  const schemaFailure =
    generated.detail !==
      'the reply did not contain parseable JSON' &&
    generated.detail !==
      'the model returned no content';

  console.warn(
    `[planner-failure] ${JSON.stringify({
      reason: generated.reason,
      repairs: generated.repairs,
      detail: String(generated.detail).slice(0, 300),
    })}`,
  );

  throw new RuntimeFailure(
    schemaFailure
      ? 'PLANNER_SCHEMA_INVALID'
      : 'PLANNER_INVALID_OUTPUT',

    generated.repairs > 0 ? 'Xroga received an unusable planning response after the bounded correction.'
      : 'Xroga received an unusable planning response. No additional model request was made.',

    {
      details: {
        reason:
          generated.reason,

        repairs:
          generated.repairs,
      },
    },
  );
}

/**
 * Rejects cross-field planner decisions that are individually schema-valid
 * but cannot describe one executable request.
 *
 * Xroga Connect mutates an already connected business application. It cannot
 * produce a project Preview, publish source code, or deploy a generated
 * product. Those requirements belong to the software runtime. Keeping this
 * invariant at the structured boundary gives the planner one bounded chance
 * to correct its capability selection before any external tool is called.
 */
export function plannerContractCoherenceError(
  goal: GoalContract,
): string | null {
  const hasBusinessAction =
    goal.requiredCapabilities.includes(
      'business.action',
    );

  if (
    !hasBusinessAction
  ) {
    return null;
  }

  if (
    goal.semanticIntent !==
      'EXTERNAL_ACTION' &&
    goal.semanticIntent !==
      'MIXED'
  ) {
    return 'business.action is valid only for an explicit connected-app state change; select the capability that produces the requested outcome';
  }

  if (
    goal.previewRequirement !==
      'NONE' ||
    goal.publicationRequirement !==
      'NONE' ||
    goal.deploymentRequirement !==
      'NONE'
  ) {
    return 'business.action cannot create a project Preview, publish source code, or deploy software; select software.implement and the applicable verification capability';
  }

  return null;
}

/**
 * Software/repository writes belong to
 * the durable build runtime.
 *
 * Connected business-app writes are a
 * different execution domain: they are
 * handled by the authenticated Xroga
 * Connect action runtime inside chat.
 */
export function dispatchForGoal(
  goal: GoalContract,

  capabilityIds:
    readonly string[],
): UniversalDispatch {
  if (
    goal.blockers.length
  ) {
    return 'blocked';
  }

  const descriptors =
    capabilityIds
      .map(
        (id) =>
          universalCapabilityRegistry
            .get(
              id,
            ),
      )
      .filter(
        Boolean,
      );

  const hasBusinessAction =
    capabilityIds.includes(
      'business.action',
    );

  const hasSoftwareImplementation =
    capabilityIds.includes(
      'software.implement',
    );

  const hasOtherWrite =
    descriptors.some(
      (item) =>
        item!.effects.includes(
          'write',
        ) &&
        String(
          item!.id,
        ) !==
          'business.action',
    );

  /*
   * Do not silently split one planner
   * turn across the repository writer
   * and an external business mutation.
   */
  if (
    hasBusinessAction &&
    (
      hasSoftwareImplementation ||
      hasOtherWrite
    )
  ) {
    return 'blocked';
  }

  if (
    hasSoftwareImplementation ||
    hasOtherWrite
  ) {
    return 'build';
  }

  if (
    hasBusinessAction
  ) {
    return 'chat';
  }

  if (
    goal.semanticIntent ===
    'MODIFY'
  ) {
    return 'blocked';
  }

  if (
    goal.semanticIntent ===
    'EXTERNAL_ACTION'
  ) {
    /*
     * Some interpreters describe a
     * public-web lookup as an external
     * action even though its executable
     * capabilities are strictly
     * read-only.
     */
    const authorizedReadOnlyExternal =
      descriptors.some(
        (item) =>
          item!.effects.includes(
            'external',
          ),
      ) &&
      descriptors.every(
        (item) =>
          !item!.effects.includes(
            'write',
          ),
      ) &&
      descriptors.every(
        (item) =>
          item!
            .requiredAuthorities
            .every(
              (authority) =>
                authority ===
                  'model:execute' ||
                /(?:^|[:-])read$/.test(
                  authority,
                ),
            ),
      );

    return authorizedReadOnlyExternal
      ? 'chat'
      : 'blocked';
  }

  return 'chat';
}

export function unresolvedGoalBlockers(
  blockers:
    readonly string[],

  grantedAuthorities:
    ReadonlySet<string>,
): string[] {
  return blockers.filter(
    (blocker) => {
      const normalized =
        blocker
          .toLowerCase();

      if (
        !normalized.includes(
          'authorit',
        )
      ) {
        return true;
      }

      return ![
        ...grantedAuthorities,
      ].some(
        (authority) =>
          normalized.includes(
            authority
              .toLowerCase(),
          ),
      );
    },
  );
}

/**
 * Deterministic intent for the explicit
 * composer `/build` command.
 */
export async function planExplicitProjectBuild(
  input: {
    userId: string;

    message: string;

    projectContext:
      NonNullable<
        GoalInterpretationInput[
          'projectContext'
        ]
      >;
  },
): Promise<SemanticRequestPlan> {
  const goal =
    input.message
      .replace(
        /^\/build\b\s*/i,
        '',
      )
      .trim();

  if (
    !goal
  ) {
    throw Object.assign(
      new Error(
        'The /build command needs a requested change.',
      ),

      {
        code:
          'INVALID_GOAL',
      },
    );
  }

  const requiredCapabilities = [
    'repository.read',

    'software.implement',

    'validation.run',

    'repository.write',
  ];

  const goalContract =
    goalContractSchema.parse(
      {
        version: '1.0',

        goal,

        desiredOutcome:
          'Implement and validate the requested change in the selected project.',

        semanticIntent:
          'MODIFY',

        constraints: [
          'Keep all work scoped to the canonical selected repository, branch, and project root.',
        ],

        acceptance: [
          'Produce repository changes and validation evidence without changing the selected project target.',
        ],

        historyContext:
          [],

        projectContext:
          input.projectContext,

        deliverables: [
          {
            id:
              'repository-change',

            mediaType:
              'application/vnd.xroga.repository-change+json',

            description:
              'Validated changes for the selected software project.',

            required:
              true,

            acceptance: [
              'The write target equals the canonical project context.',
            ],
          },
        ],

        requiredCapabilities,

        requiredAuthorities: [
          'repository:read',

          'repository:write',

          'model:execute',

          'sandbox:execute',
        ],

        risks: [
          'Repository content may change only after target and write invariants pass.',
        ],

        confidence:
          1,

        blockers:
          [],

        contextComplexity:
          'unknown',
      },
    );

  const usage =
    usageToTokenUsage(
      await getUsage(
        input.userId,
      ),
    );

  return {
    goalContract,

    dispatch:
      'build',

    capabilityIds:
      requiredCapabilities,

    rationale:
      'The user explicitly selected the /build command for the canonical active project.',

    blockers:
      [],

    usage,
  };
}

export async function resolveRequestAuthorities(
  input:
    Pick<
      Parameters<
        typeof planSemanticRequest
      >[0],
      | 'userId'
      | 'attachments'
      | 'projectContext'
    >,

  hasGitHubAuthorization: (
    userId: string,
  ) => Promise<boolean> =
    async (
      userId,
    ) =>
      Boolean(
        await getGitHubToken(
          userId,
        ),
      ),
): Promise<
  Set<string>
> {
  const authorities = new Set<string>(['model:execute', 'sandbox:execute']);

  if (
    input.attachments
      ?.length
  ) {
    authorities.add(
      'attachment:read',
    );
  }

  if (
    input.projectContext &&
    await hasGitHubAuthorization(
      input.userId,
    )
  ) {
    authorities.add(
      'repository:read',
    );

    authorities.add(
      'repository:write',
    );
  }

  if (
    process.env
      .DEEPSEEK_WEBSEARCH_FETCH_API
  ) {
    authorities.add(
      'network:public-read',
    );
  }


  return authorities;
}

export async function planSemanticRequest(
  input: {
    userId: string;
    tenantContext: TenantContext;

    message: string;

    history?:
      GoalInterpretationInput[
        'history'
      ];

    attachments?:
      GoalInterpretationInput[
        'attachments'
      ];

    projectContext?:
      GoalInterpretationInput[
        'projectContext'
      ];

    projectState?:
      GoalInterpretationInput[
        'projectState'
      ];
  },
): Promise<SemanticRequestPlan> {
  const actor = requireTenantContext(input.tenantContext);
  requireResourceOwner(actor, input.userId);
  const { tenantContext: _context, ...requestData } = input;
  input = { ...structuredClone(requestData), tenantContext: actor };
  // Explicit model selection is a request to review a separate bounded
  // engineering response, never a semantic-model purchase or repository grant.
  if(requestedSonnetReason(input.message)){
    if(input.attachments?.length)throw new RuntimeFailure('CAPABILITY_UNSUPPORTED','The capped Sonnet response supports text only. No model request was made.');
    const directResponse=await prepareSonnetConversation({context:actor,userId:actor.userId,connectedAccountId:'platform'},input.message,
      input.history?.slice(-10).map(content=>({role:'user' as const,content:`Untrusted prior conversation context:\n${content}`})));
    const goalContract=goalContractSchema.parse({version:'1.0',goal:input.message,desiredOutcome:'Review one capped complex engineering response.',
      semanticIntent:'ANSWER',constraints:['No tools, repository writes, external actions, fallback or automatic retry.'],
      acceptance:['Obtain a current exact spending approval before model execution.'],requiredCapabilities:['conversation.respond'],requiredAuthorities:[],
      confidence:1,blockers:[],contextComplexity:'high'});
    return {goalContract,dispatch:'chat',capabilityIds:['conversation.respond'],rationale:'Prepared a separate exact model spending review without inference.',blockers:[],
      usage:usageToTokenUsage(await getUsage(actor.userId)),directResponse};
  }
  const social =
    await planProtocolSocialTurn(
      input,
    );

  if (
    social
  ) {
    return social;
  }

  const models =
    selectPlannerRoutes();

  const available =
    universalCapabilityRegistry
      .list();

  const authorities =
    await resolveRequestAuthorities(
      input,
    );

  const readiness =
    new Map(
      universalCapabilityRegistry
        .snapshot(
          authorities,
        )
        .map(
          (item) => [
            item.id,
            item,
          ],
        ),
    );

  const availableSummary =
    available.map(
      ({
        id,
        title,
        description,
        effects,
        requiredAuthorities,
        inputMediaTypes,
        outputMediaTypes,
      }) => ({
        id,

        title,

        description,

        effects,

        requiredAuthorities,

        inputMediaTypes,

        outputMediaTypes,

        readiness:
          readiness.get(
            id,
          )?.state ??
          'UNSUPPORTED',
      }),
    );

  const system =
    `Understand the user's current goal from the full conversation and context. Return one strict JSON semantic decision, not the full internal contract. Do not use product modes, keyword categories, framework guesses, or a default website/build route. Choose the smallest READY capability set that can genuinely produce the requested outcome. Read-only analysis must remain read-only. Use research.public-web for public websites, flight schedules, fares, prices, travel planning, and other information that does not live inside a user's connected app. Do not select business.read merely because the user says search or research. Select business.action only when the user explicitly asks Xroga to change external business-app state; use business.read for retrieval, search, inspection, listing, or summarization inside the user's connected applications without mutation. A request to create or change software requires software.implement even when the software models concepts that also exist in connected apps, such as records, schedules, messages, payments, or files. Xroga Connect acts on an existing external account; it does not create a requested software product, project Preview, source publication, or deployment. Never upgrade a read request into an action, and never treat a request for an external action as answer-only. If the user requests several independent external actions, preserve every requested outcome; do not imply a single tool call completed them all. A project being present is context, not evidence of modification intent. The server owns project identity and authorities; do not return or invent either. Use blockers only for essential missing user input, AUTH_REQUIRED, PROVIDER_UNAVAILABLE, TEMPORARILY_UNAVAILABLE, or UNSUPPORTED capability. Never call information current unless freshnessRequirement is PREFERRED or CURRENT_REQUIRED.\n\n${currentProductTruth(
      authorities,
    )}\n\nRequired JSON fields: semanticIntent=ANSWER|INVESTIGATE|PROPOSE|MODIFY|EXTERNAL_ACTION|MIXED; requiredCapabilities=[registered ids]; freshnessRequirement=NONE|PREFERRED|CURRENT_REQUIRED. Optional fields: goal; desiredOutcome; constraints[]; acceptance[]; sourcePolicy={mode:any|official_only,scope:public_web|x,officialDomains:[]}; previewRequirement=NONE|PREFERRED|REQUIRED; publicationRequirement=NONE|REQUESTED; deploymentRequirement=NONE|REQUESTED; risks[]; confidence=0..1; blockers[]; contextComplexity=low|medium|high|unknown.\n\nRegistered capabilities and request-time readiness:\n${JSON.stringify(
      availableSummary,
    )}\n\n${PRESENTATION_PLAN_INSTRUCTIONS}`;

  const interpretationInput:
    GoalInterpretationInput = {
      message:
        input.message,

      history:
        input.history ??
        [],

      attachments:
        input.attachments ??
        [],

      projectContext:
        input.projectContext ??
        null,

      projectState:
        input.projectState,
    };

  const messages:
    ChatMessage[] = [
      {
        role:
          'system',

        content:
          system,
      },

      {
        role:
          'user',

        content:
          JSON.stringify(
            interpretationInput,
          ),
      },
    ];

  const maximumOutputTokens =
    1_500;

  const configuredTotalMs =
    Number(
      process.env
        .SEMANTIC_PLANNER_TOTAL_TIMEOUT_MS,
    );

  const totalTimeoutMs =
    Number.isFinite(
      configuredTotalMs,
    )
      ? Math.min(
          SEMANTIC_PLANNER_MAX_TOTAL_TIMEOUT_MS,

          Math.max(
            5_000,

            configuredTotalMs,
          ),
        )
      : SEMANTIC_PLANNER_DEFAULT_TOTAL_TIMEOUT_MS;

  const totalController =
    new AbortController();

  const totalTimer =
    setTimeout(
      () =>
        totalController.abort(),

      totalTimeoutMs,
    );

  let lastStructuredFailure:
    RuntimeFailure | null =
      null;

  let finalModelId:
    ModelId | null =
      null;

  try {
    const planned =
      await executeHedgedPlannerFallback(
        {
          routes:
            models,

          routeTimeoutMs:
            Math.min(
              SEMANTIC_PLANNER_ROUTE_TIMEOUT_MS,

              totalTimeoutMs,
            ),

          signal:
            totalController
              .signal,

          execute:
            async (
              modelId,
              signal,
            ) => {
              let correctionUsed =
                false;

              let completionShape: { finish: 'stop' | 'length' | 'other'; outputTokens: number } | undefined;

              const goalContract =
                await resolveStructuredGoalContract(
                  async (
                    repairHint,
                  ) => {
                    if (
                      repairHint
                    ) {
                      correctionUsed =
                        true;
                    }

                    const attemptMessages:
                      ChatMessage[] =
                      repairHint
                        ? [
                            ...messages,

                            {
                              role:
                                'user',

                              content:
                                `Correct the previous planning output. ${repairHint}`,
                            },
                          ]
                        : messages;

                    const completion =
                      await withTenantModelReservation(
                        {
                          // Planning uses the platform account and request-supplied
                          // metadata. This does not confer repository/file authority.
                          scope: { context: actor, userId: actor.userId, connectedAccountId: 'platform' },
                          payload: { messages: attemptMessages },

                          modelId,

                          estimatedInputTokens:
                            estimateMessageTokens(
                              attemptMessages,
                            ),

                          maximumOutputTokens,

                          purpose:
                            'complexity',

                          execute:
                            dispatch =>
                              chatCompletion(
                                modelId,

                                dispatch.payload.messages as ChatMessage[],

                                { ...semanticPlannerCompletionOptions(signal), beforeDispatch: dispatch.beforeDispatch },
                              ),
                        },
                      );

                    finalModelId =
                      completion.modelId;
                    completionShape = {
                      finish: completion.finishReason === 'stop' || completion.finishReason === 'length'
                        ? completion.finishReason : 'other',
                      outputTokens: completion.outputTokens,
                    };

                    /* Canonical dispatch already verified the atomic usage receipt. */

                    return completion
                      .text;
                  },

                  0,

                  (
                    value,
                  ) =>
                    normalizePlannerDecisionCandidate(
                      value,

                      interpretationInput,
                    ),
                )
                  .catch(
                    (
                      error,
                    ) => {
                      if (
                        error instanceof
                        RuntimeFailure
                      ) {
                        if (completionShape) {
                          console.warn('[planner-completion-shape]', { modelId, code: error.code, ...completionShape });
                        }
                        lastStructuredFailure =
                          error;

                        recordModelValidation(
                          modelId,
                          false,
                        );
                      }

                      throw error;
                    },
                  );

              recordModelValidation(
                modelId,
                true,
              );

              return goalContract;
            },
        },
      );

    const interpretedGoal = enforceInlineCalculatorIntent(planned.value, interpretationInput);
    const goalContract =
      goalContractSchema.parse(
        {
          ...interpretedGoal,

          requiredAuthorities: [
            ...new Set(
              interpretedGoal
                .requiredCapabilities
                .flatMap(
                  (
                    capabilityId,
                  ) =>
                    universalCapabilityRegistry
                      .get(
                        capabilityId,
                      )
                      ?.requiredAuthorities ??
                    [],
                ),
            ),
          ],
        },
      );

    const capabilityPlan =
      await planCapabilities(
        {
          goal:
            goalContract,

          registry:
            universalCapabilityRegistry,

          authorities,

          select:
            async () => ({
              capabilityIds:
                goalContract
                  .requiredCapabilities,

              rationale:
                'Selected by the semantic interpreter from the live capability registry.',
            }),
        },
      );

    const blockers = [
      ...unresolvedGoalBlockers(
        goalContract.blockers,

        authorities,
      ),

      ...capabilityPlan
        .rejected
        .map(
          (item) =>
            `${item.id}: ${item.reason}`,
        ),
    ];

    const usage =
      await getUsage(
        input.userId,
      );

    const effectiveGoal =
      blockers.length
        ? goalContractSchema.parse(
            {
              ...goalContract,

              blockers,
            },
          )
        : goalContract;

    return {
      goalContract:
        effectiveGoal,

      dispatch:
        blockers.length
          ? 'blocked'
          : dispatchForGoal(
              effectiveGoal,

              capabilityPlan
                .capabilities
                .map(
                  (item) =>
                    item.id,
                ),
            ),

      capabilityIds:
        capabilityPlan
          .capabilities
          .map(
            (item) =>
              item.id,
          ),

      rationale:
        capabilityPlan
          .rationale,

      blockers,

      usage:
        usageToTokenUsage(
          usage,
        ),
    };
  } catch (error) {
    if (isTerminalModelFailure(error)) throw error;
    if (
      totalController
        .signal
        .aborted
    ) {
      throw new RuntimeFailure(
        'PLANNER_TIMEOUT',

        'Xroga could not understand this request before the planning deadline. Please retry.',

        {
          cause:
            error,

          details: {
            totalTimeoutMs,
          },
        },
      );
    }

    if (
      lastStructuredFailure
    ) {
      throw lastStructuredFailure;
    }

    const failures =
      (
        (
          error as {
            failures?:
              Array<{
                kind?: string;
              }>;
          }
        ).failures ??
        (
          error instanceof
            RuntimeFailure &&
          Array.isArray(
            error.details
              ?.failures,
          )
            ? error.details
                .failures as
                Array<{
                  kind?: string;
                }>
            : []
        )
      );

    if (
      failures.some(
        (failure) =>
          failure.kind ===
          'timeout',
      )
    ) {
      throw new RuntimeFailure(
        'PLANNER_TIMEOUT',

        'The planning model timed out. Please retry this request.',

        {
          cause:
            error,
        },
      );
    }

    throw new RuntimeFailure(
      'PLANNER_PROVIDER_UNAVAILABLE',

      'The planning service is temporarily unavailable. Please retry.',

      {
        cause:
          error,

        details: {
          attemptedModels:
            models.length,

          finalModelId,
        },
      },
    );
  } finally {
    clearTimeout(
      totalTimer,
    );
  }
}
