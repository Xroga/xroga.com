import {
  Router,
} from 'express';

import {
  getCapabilityRegistry,
} from '../lib/capabilityRegistry.js';

import {
  createAdaptiveExecutionPlan,
} from '../lib/adaptiveOrchestrator.js';

import type {
  ProjectContext,
} from '../lib/adaptiveOrchestrator.js';

import type {
  StorageProviderId,
  StorageProviderState,
} from '../lib/storageSelection.js';

import {
  createIntelligentRoutePlan,
} from '../ai/intelligentRouter.js';

import {
  publicIntelligenceHealth,
} from '../ai/modelCapabilityRegistry.js';

import {
  BLACK_HOLE_PUBLIC_NAME,
  publicBlocker,
  publicModeFor,
  publicTierFor,
  type PublicPlan,
} from '../ai/black-hole/publicIdentity.js';

import type {
  RoutingMode,
} from '../ai/routerConfig.js';

const router =
  Router();

const STORAGE_IDS =
  new Set<StorageProviderId>([
    'existing',
    'supabase',
    'upstash-redis',
    'upstash-vector',
    'neon',
    'postgres',
    'mysql',
    'mongodb',
    'firebase',
    'cloudflare',
    'vercel-blob',
    'sqlite',
    'local-files',
    'object-storage',
    'self-hosted',
  ]);

function storageStates(
  value: unknown,
):
  | StorageProviderState[]
  | undefined {
  if (
    !Array.isArray(value)
  ) {
    return undefined;
  }

  return value.flatMap(
    (entry) => {
      if (
        !entry ||
        typeof entry !==
          'object'
      ) {
        return [];
      }

      const item =
        entry as Record<
          string,
          unknown
        >;

      if (
        typeof item.id !==
          'string' ||
        !STORAGE_IDS.has(
          item.id as
            StorageProviderId,
        ) ||
        typeof item.configured !==
          'boolean'
      ) {
        return [];
      }

      return [
        {
          id:
            item.id as
              StorageProviderId,

          configured:
            item.configured,

          healthy:
            typeof item.healthy ===
            'boolean'
              ? item.healthy
              : undefined,
        },
      ];
    },
  );
}

/**
 * Public project context.
 *
 * Provider configuration, provider health and model support
 * are deliberately not accepted from the browser.
 */
function projectContext(
  value: unknown,
): ProjectContext {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return {};
  }

  const candidate =
    value as Record<
      string,
      unknown
    >;

  return {
    repositoryPresent:
      typeof candidate.repositoryPresent ===
      'boolean'
        ? candidate.repositoryPresent
        : undefined,

    existingStorage:
      storageStates(
        candidate.existingStorage,
      ),

    availableStorage:
      storageStates(
        candidate.availableStorage,
      ),

    /**
     * Never hydrate modelProviders from req.body.
     *
     * The browser cannot truthfully assert server credential
     * or provider-health state.
     */
    modelProviders:
      undefined,
  };
}

router.get(
  '/',
  (_req, res) => {
    res.json({
      generatedAt:
        new Date().toISOString(),

      capabilities:
        getCapabilityRegistry(),

      intelligence:
        publicIntelligenceHealth(),
    });
  },
);

router.post(
  '/plan',
  (req, res) => {
    const prompt =
      typeof req.body?.prompt ===
      'string'
        ? req.body.prompt.trim()
        : '';

    const context =
      typeof req.body?.context ===
      'string'
        ? req.body.context.trim()
        : '';

    if (!prompt) {
      res
        .status(400)
        .json({
          error:
            'prompt is required',

          code:
            'PROMPT_REQUIRED',

          status:
            'blocked',
        });

      return;
    }

    const project =
      projectContext(
        req.body?.project,
      );

    const adaptive =
      createAdaptiveExecutionPlan(
        prompt,
        context,
        project,
      );

    const requestedMode:
      | RoutingMode
      | undefined =
      req.body?.mode ===
        'intelligence' ||
      req.body?.mode ===
        'balanced' ||
      req.body?.mode ===
        'cost'
        ? req.body.mode
        : undefined;

    const repositoryFileCount =
      typeof req.body
        ?.repositoryFileCount ===
      'number'
        ? Math.max(
            0,
            Math.floor(
              req.body
                .repositoryFileCount,
            ),
          )
        : 0;

    const affectedFileCount =
      typeof req.body
        ?.affectedFileCount ===
      'number'
        ? Math.max(
            0,
            Math.floor(
              req.body
                .affectedFileCount,
            ),
          )
        : 0;

    const routerPlan =
      createIntelligentRoutePlan({
        prompt:
          `${prompt}\n${context}`.trim(),

        mode:
          requestedMode,

        repositoryFileCount,

        affectedFileCount,
      });

    /**
     * Never expose internal model/provider routing.
     */
    const publicPlan:
      PublicPlan = {
      status:
        adaptive.status,

      intelligence:
        BLACK_HOLE_PUBLIC_NAME,

      mode:
        publicModeFor(
          routerPlan.mode,
        ),

      researchRequired:
        adaptive.route.research,

      steps:
        routerPlan.subtasks.map(
          (task) => ({
            id: task.id,

            purpose:
              task.objective,

            dependsOn:
              task.dependsOn,

            status:
              task.blocker
                ? 'blocked'
                : 'ready',

            blocker:
              task.blocker,

            tier:
              publicTierFor(
                task.taskClass,
              ),

            review:
              task.taskClass.includes(
                'review',
              ),
          }),
        ),

      blockers: [
        ...new Set([
          ...adaptive.blockers,
          ...routerPlan.blockers,
        ]),
      ].map(
        publicBlocker,
      ),

      capabilities:
        adaptive.capabilities.map(
          (capability) =>
            capability.id,
        ),
    };

    res.json(
      publicPlan,
    );
  },
);

export default router;
