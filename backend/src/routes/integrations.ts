import {
  Router,
  type Response,
} from 'express';

import { z } from 'zod';

import type {
  AuthRequest,
} from '../middleware/auth.js';

import {
  retiredJson,
} from './retiredSurface.js';

import {
  ALLOWED_PROVIDERS,
  PUBLISH_ONLY_PROVIDERS,
  connectUserSupabase,
  deleteUserProviderKey,
  getUserSupabaseStatus,
  listUserProviderKeys,
  providerCatalog,
  saveUserProviderKey,
} from '../services/integrations/userProviderKeys.js';

import {
  getVercelToken,
} from '../services/integrations/vercelAuth.js';

import {
  getUserPluginPermissionMode,
  setUserPluginPermissionMode,
} from '../services/integrations/pluginPermissionPolicy.js';

import {
  syncUserVaultToVercel,
} from '../services/integrations/githubDeploy.js';

import {
  ComposioClientError,
  canUserAccessComposioToolSlug,
  canUserAccessComposioToolkit,
  createComposioConnectionLink,
  createReadOnlyComposioSession,
  createUserCustomMcpToolkit,
  deleteUserCustomMcpToolkit,
  filterComposioCatalogForUser,
  executeComposioReadTool,
  getComposioCatalogToolkit,
  getComposioToolDetails,
  isComposioConfigured,
  listComposioCatalog,
  listComposioCatalogCategories,
  listComposioCatalogGroup,
  listComposioCatalogTools,
  listComposioToolkits,
  listUserCustomMcpToolkits,
  listComposioTriggerTypes,
  listConnectedComposioToolkits,
  searchComposioActionTools,
  searchComposioTools,
  syncUserCustomMcpToolkit,
} from '../services/integrations/composioClient.js';

const router = Router();

/**
 * Catalog of providers users can paste keys for
 * (their product, not Xroga platform AI).
 */
router.get(
  '/ai-catalog',
  (_req, res) => {
    const catalog =
      providerCatalog().map(
        (p) => ({
          id: p.id,
          name: p.name,
          category:
            p.category,
          freeTier:
            p.freeTier,

          requiresApiKey:
            true,

          endpoint:
            p.envVar,

          envVar:
            p.envVar,

          signupUrl:
            undefined,

          userGuidance:
            p.id === 'custom'
              ? 'Paste any secret and set the env var name. Synced to your Vercel project on deploy — never committed to GitHub.'
              : p.id ===
                    'supabase_url'
                ? 'Your Supabase project URL (https://xxxx.supabase.co). Built apps use THIS project for auth/DB/storage — not Xroga’s.'
                : p.id.startsWith(
                      'supabase',
                    )
                  ? `Saved encrypted as ${p.envVar}. Pair with project URL so your deploy talks to YOUR Supabase.`
                  : p.category ===
                        'publish'
                    ? `Saved encrypted in your Xroga vault as ${p.envVar}. Used for your Expo/EAS store builds — you pay Apple/Google fees, not Xroga. Never committed to GitHub.`
                    : `Saved encrypted in your Xroga vault as ${p.envVar}. Auto-synced to Vercel when you deploy.`,

          xrogaProvided:
            false,
        }),
      );

    res.json({
      catalog,

      fieldEndpoints: [],

      legacyAiRetired:
        false,

      vault:
        'aes-256-gcm',

      vercelEnvSync:
        true,

      message:
        'Paste API keys for your live product. Xroga encrypts them and syncs to your Vercel env on deploy. Platform AI (Apex/Horizon/Forge/Live) uses Xroga keys — not these.',

      allowedProviders:
        ALLOWED_PROVIDERS,
    });
  },
);

router.get(
  '/supabase/status',
  async (
    req: AuthRequest,
    res,
  ) => {
    try {
      const status =
        await getUserSupabaseStatus(
          req.userId!,
        );

      res.json(status);
    } catch (err) {
      const raw =
        (err as Error)
          .message || '';

      const schemaMiss =
        /schema cache|user_integrations|could not find the table/i.test(
          raw,
        );

      res.status(
        schemaMiss
          ? 200
          : 500,
      ).json({
        connected: false,
        ready: false,
        provisioned:
          false,
        hasUrl: false,
        hasAnonKey:
          false,
        hasServiceRole:
          false,
        hasAccessToken:
          false,
        hasDbPassword:
          false,

        message:
          schemaMiss
            ? 'Authorize Supabase to continue — vault uses secure storage until the DB table is ready.'
            : raw,
      });
    }
  },
);

/**
 * List projects for a Supabase
 * personal access token.
 */
router.post(
  '/supabase/list-projects',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        accessToken: z
          .string()
          .min(20)
          .max(4096),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const {
        listSupabaseProjects,
      } = await import(
        '../services/integrations/supabaseProvision.js'
      );

      const projects =
        await listSupabaseProjects(
          parsed.data
            .accessToken
            .trim(),
        );

      res.json({
        projects,
      });
    } catch (err) {
      res.status(400).json({
        error:
          (err as Error)
            .message,

        projects: [],
      });
    }
  },
);

/**
 * One-click connect:
 *
 * Access Token + project ref
 * →
 * fetch keys
 * →
 * save vault
 * →
 * provision THEIR Supabase.
 */
router.post(
  '/supabase/one-click',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        accessToken: z
          .string()
          .min(20)
          .max(4096),

        projectRef: z
          .string()
          .min(10)
          .max(64),

        projectName: z
          .string()
          .min(1)
          .max(120)
          .optional(),

        vercelProject: z
          .string()
          .min(2)
          .max(64)
          .optional(),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const {
        oneClickConnectSupabase,
      } = await import(
        '../services/integrations/supabaseProvision.js'
      );

      const result =
        await oneClickConnectSupabase(
          {
            userId:
              req.userId!,

            accessToken:
              parsed.data
                .accessToken,

            projectRef:
              parsed.data
                .projectRef,

            projectName:
              parsed.data
                .projectName,

            vercelProject:
              parsed.data
                .vercelProject,
          },
        );

      let envSync:
        Awaited<
          ReturnType<
            typeof syncUserVaultToVercel
          >
        > | null = null;

      const project =
        parsed.data
          .vercelProject
          ?.trim();

      if (
        project &&
        (await getVercelToken(
          req.userId!,
        ))
      ) {
        try {
          envSync =
            await syncUserVaultToVercel(
              req.userId!,
              project,
            );
        } catch (err) {
          envSync = {
            ok: false,

            projectName:
              project,

            upserted: [],

            skipped: [],

            error:
              (err as Error)
                .message
                .slice(
                  0,
                  240,
                ),
          };
        }
      }

      res.json({
        ok:
          result.status
            .ready &&
          result.provision
            .ok,

        status:
          result.status,

        provision:
          result.provision,

        envSync,

        message:
          result.provision
            .message ||
          result.status
            .message,
      });
    } catch (err) {
      res.status(400).json({
        error:
          (err as Error)
            .message,
      });
    }
  },
);

/**
 * Connect with pasted keys
 * + optional PAT/DB password.
 */
router.post(
  '/supabase/connect',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        projectUrl: z
          .string()
          .url()
          .max(512),

        anonKey: z
          .string()
          .min(20)
          .max(4096),

        serviceRoleKey: z
          .string()
          .min(20)
          .max(4096)
          .optional(),

        accessToken: z
          .string()
          .min(20)
          .max(4096)
          .optional(),

        dbPassword: z
          .string()
          .min(4)
          .max(512)
          .optional(),

        projectName: z
          .string()
          .min(1)
          .max(120)
          .optional(),

        vercelProject: z
          .string()
          .min(2)
          .max(64)
          .optional(),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const {
        status,
        saved,
        provision,
      } =
        await connectUserSupabase(
          req.userId!,
          {
            projectUrl:
              parsed.data
                .projectUrl,

            anonKey:
              parsed.data
                .anonKey,

            serviceRoleKey:
              parsed.data
                .serviceRoleKey,

            accessToken:
              parsed.data
                .accessToken,

            dbPassword:
              parsed.data
                .dbPassword,

            projectName:
              parsed.data
                .projectName,
          },
        );

      let envSync:
        Awaited<
          ReturnType<
            typeof syncUserVaultToVercel
          >
        > | null = null;

      const project =
        parsed.data
          .vercelProject
          ?.trim();

      if (
        project &&
        (await getVercelToken(
          req.userId!,
        ))
      ) {
        try {
          envSync =
            await syncUserVaultToVercel(
              req.userId!,
              project,
            );
        } catch (err) {
          envSync = {
            ok: false,

            projectName:
              project,

            upserted: [],

            skipped: [],

            error:
              (err as Error)
                .message
                .slice(
                  0,
                  240,
                ),
          };
        }
      }

      res.json({
        ok:
          status.ready,

        status,

        provision,

        saved:
          saved.map(
            (s) => ({
              provider:
                s.provider,

              envVar:
                s.envVar,

              masked:
                s.masked,
            }),
          ),

        envSync,

        message:
          provision?.message ||
          status.message,
      });
    } catch (err) {
      res.status(400).json({
        error:
          (err as Error)
            .message,
      });
    }
  },
);

/**
 * Re-run provision on an
 * already-connected project.
 */
router.post(
  '/supabase/provision',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        projectName: z
          .string()
          .min(1)
          .max(120)
          .optional(),
      });

    const parsed =
      schema.safeParse(
        req.body ?? {},
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const {
        getUserProviderKey,
      } = await import(
        '../services/integrations/userProviderKeys.js'
      );

      const {
        provisionUserSupabase,
      } = await import(
        '../services/integrations/supabaseProvision.js'
      );

      const [
        url,
        service,
        dbPass,
      ] =
        await Promise.all([
          getUserProviderKey(
            req.userId!,
            'supabase_url',
          ),

          getUserProviderKey(
            req.userId!,
            'supabase',
          ),

          getUserProviderKey(
            req.userId!,
            'supabase_db_password',
          ),
        ]);

      const {
        getUserSupabaseManagementToken,
      } = await import(
        '../services/integrations/supabaseProvision.js'
      );

      const pat =
        await getUserSupabaseManagementToken(
          req.userId!,
        );

      if (
        !url ||
        !service
      ) {
        res.status(400).json({
          error:
            'Connect Supabase first',
        });

        return;
      }

      const provision =
        await provisionUserSupabase(
          {
            projectUrl: url,

            serviceRoleKey:
              service,

            accessToken:
              pat ||
              undefined,

            dbPassword:
              dbPass ||
              undefined,

            projectName:
              parsed.data
                .projectName,
          },
        );

      res.json({
        ok:
          provision.ok,

        provision,

        message:
          provision.message,
      });
    } catch (err) {
      res.status(400).json({
        error:
          (err as Error)
            .message,
      });
    }
  },
);

router.get(
  '/provider-keys',
  async (
    req: AuthRequest,
    res,
  ) => {
    try {
      const keys =
        await listUserProviderKeys(
          req.userId!,
        );

      res.json({
        keys,

        vault:
          'aes-256-gcm',
      });
    } catch (err) {
      res.status(500).json({
        error:
          (err as Error)
            .message,

        keys: [],
      });
    }
  },
);

router.post(
  '/provider-keys',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        provider: z
          .string()
          .min(2)
          .max(64),

        apiKey: z
          .string()
          .min(8)
          .max(48_000),

        envVarName: z
          .string()
          .min(2)
          .max(64)
          .optional(),

        vercelProject: z
          .string()
          .min(2)
          .max(64)
          .optional(),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const saved =
        await saveUserProviderKey(
          req.userId!,

          parsed.data
            .provider,

          parsed.data
            .apiKey,

          {
            envVarName:
              parsed.data
                .envVarName,
          },
        );

      let envSync:
        Awaited<
          ReturnType<
            typeof syncUserVaultToVercel
          >
        > | null = null;

      const project =
        parsed.data
          .vercelProject
          ?.trim();

      const isPublish =
        PUBLISH_ONLY_PROVIDERS
          .has(
            saved.provider,
          );

      if (
        !isPublish &&
        project &&
        (await getVercelToken(
          req.userId!,
        ))
      ) {
        try {
          envSync =
            await syncUserVaultToVercel(
              req.userId!,
              project,
            );
        } catch (err) {
          envSync = {
            ok: false,

            projectName:
              project,

            upserted: [],

            skipped: [],

            error:
              (err as Error)
                .message
                .slice(
                  0,
                  240,
                ),
          };
        }
      }

      const envSyncFailed =
        Boolean(
          envSync &&
          envSync.ok ===
            false,
        );

      res.json({
        ok: true,

        provider:
          saved.provider,

        masked:
          saved.masked,

        envVar:
          saved.envVar,

        envSync,

        message:
          isPublish
            ? 'Publish credential encrypted in your account. Used for your Expo/EAS store flow — Apple/Google fees stay on you.'
            : envSyncFailed
              ? `Key encrypted, but vault → Vercel env sync failed${
                  envSync?.error
                    ? `: ${envSync.error}`
                    : ''
                }. Use Sync to Vercel or re-deploy.`
              : 'Key encrypted in your account. Connect Vercel and deploy (or pass vercelProject) to sync env vars.',
      });
    } catch (err) {
      res.status(400).json({
        error:
          (err as Error)
            .message,
      });
    }
  },
);

router.delete(
  '/provider-keys/:provider',
  async (
    req: AuthRequest,
    res,
  ) => {
    try {
      await deleteUserProviderKey(
        req.userId!,
        String(
          req.params
            .provider,
        ),
      );

      res.json({
        ok: true,
      });
    } catch (err) {
      res.status(400).json({
        error:
          (err as Error)
            .message,
      });
    }
  },
);

/**
 * Explicit sync of vault
 * → a Vercel project
 * authorized by the user.
 */
router.post(
  '/sync-vercel-env',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        projectSlug: z
          .string()
          .min(2)
          .max(64),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          parsed.error.flatten(),
      });

      return;
    }

    if (
      !(
        await getVercelToken(
          req.userId!,
        )
      )
    ) {
      res.status(403).json({
        error:
          'Connect Vercel first and approve project environment access',

        connected:
          false,
      });

      return;
    }

    try {
      const result =
        await syncUserVaultToVercel(
          req.userId!,
          parsed.data
            .projectSlug,
        );

      res.json({
        ok:
          Boolean(
            result?.ok,
          ),

        result,
      });
    } catch (err) {
      res.status(502).json({
        error:
          (err as Error)
            .message,
      });
    }
  },
);

/*
 * -------------------------------------------------
 * XROGA CONNECT
 * -------------------------------------------------
 *
 * All routes below inherit authMiddleware from:
 *
 * app.use(
 *   '/api/integrations',
 *   authMiddleware,
 *   integrationsRouter,
 * )
 *
 * Browser input never selects the Composio user.
 * The authenticated Xroga req.userId is authoritative.
 */

function sendComposioError(
  res: Response,
  error: unknown,
): void {
  if (
    error instanceof
    ComposioClientError
  ) {
    res.status(
      error.status,
    ).json({
      ok: false,

      error:
        error.message,

      code:
        error.code,
    });

    return;
  }

  res.status(502).json({
    ok: false,

    error:
      'Xroga Connect is temporarily unavailable.',

    code:
      'XROGA_CONNECT_ERROR',
  });
}

/**
 * Lightweight availability
 * check for the frontend.
 */
router.get(
  '/xroga-connect/permission-policy',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(100)
        .optional(),
    });

    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const mode = await getUserPluginPermissionMode(
        req.userId!,
        parsed.data.toolkit,
      );

      res.json({
        ok: true,
        mode,
        ...(parsed.data.toolkit
          ? {
              toolkit: parsed.data.toolkit,
            }
          : {}),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Could not load Plugin permissions.',
      });
    }
  },
);

router.patch(
  '/xroga-connect/permission-policy',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      mode: z.enum([
        'always_ask',
        'read_only',
        'low_risk',
        'full_access',
      ]),
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(100)
        .optional(),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const mode = await setUserPluginPermissionMode(
        req.userId!,
        parsed.data.mode,
        parsed.data.toolkit,
      );

      res.json({
        ok: true,
        mode,
        ...(parsed.data.toolkit
          ? {
              toolkit: parsed.data.toolkit,
            }
          : {}),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Could not save Plugin permissions.',
      });
    }
  },
);

router.get(
  '/xroga-connect/status',
  (_req, res) => {
    res.json({
      configured:
        isComposioConfigured(),

      mode:
        'read_only',
    });
  },
);

/**
 * Canonical Composio catalog for the Plugins marketplace.
 *
 * This is catalog metadata only. It never connects accounts or executes tools.
 */
router.get(
  '/xroga-connect/catalog',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      search: z.string().trim().max(120).optional(),
      category: z
        .string()
        .trim()
        .max(120)
        .optional(),
      group: z
        .enum([
          'productivity',
          'communication',
          'sales-crm',
          'support',
          'commerce-payments',
          'marketing-growth',
          'booking-scheduling',
          'travel-hospitality',
          'finance-accounting',
          'data-analytics',
          'databases',
          'developer-tools',
          'deployment-hosting',
          'cloud-infrastructure',
          'ai-automation',
          'content-files',
          'design-media',
          'hr-recruiting',
          'education-research',
          'scientific-research',
          'security',
          'healthcare-fitness',
          'entertainment',
          'other',
          // Legacy aliases retained for already-loaded clients during deploys.
          'engineering',
          'commerce',
          'marketing',
          'finance',
          'infrastructure',
          'healthcare',
          'travel',
        ])
        .optional(),
      sortBy: z.enum(['usage', 'alphabetically']).optional().default('usage'),
      limit: z.coerce.number().int().min(1).max(250).optional().default(120),
      cursor: z.string().trim().max(1000).optional(),
    });

    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const page = parsed.data.group
        ? await listComposioCatalogGroup({
            group: parsed.data.group,
            limit: parsed.data.limit,
            ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
          })
        : await listComposioCatalog({
            sortBy: parsed.data.sortBy,
            limit: parsed.data.limit,
            ...(parsed.data.search ? { search: parsed.data.search } : {}),
            ...(parsed.data.category ? { category: parsed.data.category } : {}),
            ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
          });

      res.json({
        ok: true,
        ...page,
        items: filterComposioCatalogForUser(
          req.userId!,
          page.items,
        ),
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.get(
  '/xroga-connect/catalog-categories',
  async (
    _req: AuthRequest,
    res,
  ) => {
    try {
      const categories = await listComposioCatalogCategories();

      res.json({
        ok: true,
        categories,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.get(
  '/xroga-connect/catalog/:toolkit/tools',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[A-Za-z0-9_-]+$/),
      limit: z.coerce.number().int().min(1).max(250).optional().default(250),
      cursor: z.string().trim().max(1000).optional(),
    });

    const parsed = schema.safeParse({
      toolkit: req.params.toolkit,
      ...req.query,
    });

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      if (!canUserAccessComposioToolkit(req.userId!, parsed.data.toolkit)) {
        res.status(404).json({
          ok: false,
          error: 'Plugin not found.',
        });
        return;
      }

      const page = await listComposioCatalogTools(
        parsed.data.toolkit,
        {
          limit: parsed.data.limit,
          ...(parsed.data.cursor
            ? {
                cursor: parsed.data.cursor,
              }
            : {}),
        },
      );

      res.json({
        ok: true,
        ...page,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.get(
  '/xroga-connect/catalog/:toolkit/triggers',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[A-Za-z0-9_-]+$/),
      limit: z.coerce.number().int().min(1).max(50).optional().default(50),
      cursor: z.string().trim().max(1000).optional(),
    });

    const parsed = schema.safeParse({
      toolkit: req.params.toolkit,
      ...req.query,
    });

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      if (!canUserAccessComposioToolkit(req.userId!, parsed.data.toolkit)) {
        res.status(404).json({
          ok: false,
          error: 'Plugin not found.',
        });
        return;
      }

      const page = await listComposioTriggerTypes(
        parsed.data.toolkit,
        {
          limit: parsed.data.limit,
          ...(parsed.data.cursor
            ? {
                cursor: parsed.data.cursor,
              }
            : {}),
        },
      );

      res.json({
        ok: true,
        ...page,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.get(
  '/xroga-connect/catalog/:toolkit',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[A-Za-z0-9_-]+$/),
    });

    const parsed = schema.safeParse({
      toolkit: req.params.toolkit,
    });

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      if (!canUserAccessComposioToolkit(req.userId!, parsed.data.toolkit)) {
        res.status(404).json({
          ok: false,
          error: 'Plugin not found.',
        });
        return;
      }

      const toolkit = await getComposioCatalogToolkit(parsed.data.toolkit);

      if (!canUserAccessComposioToolkit(req.userId!, toolkit.slug)) {
        res.status(404).json({
          ok: false,
          error: 'Plugin not found.',
        });
        return;
      }

      res.json({
        ok: true,
        toolkit,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

/**
 * Full metadata for one Composio action.
 *
 * Used by the Advanced action inspector. This is metadata-only and never
 * executes the tool or exposes provider credentials.
 */
router.get(
  '/xroga-connect/tool-details/:toolSlug',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolSlug: z
        .string()
        .trim()
        .min(3)
        .max(200)
        .regex(/^[A-Za-z0-9_-]+$/),
    });

    const parsed = schema.safeParse({
      toolSlug: req.params.toolSlug,
    });

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const tool = await getComposioToolDetails(parsed.data.toolSlug);

      if (
        !canUserAccessComposioToolkit(req.userId!, tool.toolkit) ||
        !canUserAccessComposioToolSlug(req.userId!, tool.slug)
      ) {
        res.status(404).json({
          ok: false,
          error: 'Action not found.',
        });
        return;
      }

      res.json({
        ok: true,
        tool,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

/**
 * Explicit session creation.
 *
 * Useful for UI initialization
 * and future agent flows.
 */
router.post(
  '/xroga-connect/session',
  async (
    req: AuthRequest,
    res,
  ) => {
    try {
      const session =
        await createReadOnlyComposioSession(
          req.userId!,
        );

      res.json({
        ok: true,

        sessionId:
          session.session_id,

        mode:
          'read_only',
      });
    } catch (error) {
      sendComposioError(
        res,
        error,
      );
    }
  },
);

/**
 * Search read-only external
 * app capabilities.
 *
 * If sessionId is missing,
 * the server creates one.
 */
router.post(
  '/xroga-connect/search',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        query: z
          .string()
          .trim()
          .min(2)
          .max(500),

        sessionId: z
          .string()
          .trim()
          .regex(
            /^trs_[A-Za-z0-9_-]+$/,
          )
          .optional(),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        ok: false,

        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const result =
        await searchComposioTools(
          req.userId!,
          parsed.data,
        );

      res.json({
        ok: true,
        ...result,
        tools: result.tools.filter(
          (tool) =>
            canUserAccessComposioToolkit(req.userId!, tool.toolkit) &&
            canUserAccessComposioToolSlug(req.userId!, tool.slug),
        ),
        toolkits: result.toolkits.filter((toolkit) =>
          canUserAccessComposioToolkit(req.userId!, toolkit.toolkit),
        ),
        ...(result.skill
          ? {
              skill: {
                ...result.skill,
                primaryToolSlugs: result.skill.primaryToolSlugs.filter((slug) =>
                  canUserAccessComposioToolSlug(req.userId!, slug),
                ),
                relatedToolSlugs: result.skill.relatedToolSlugs.filter((slug) =>
                  canUserAccessComposioToolSlug(req.userId!, slug),
                ),
              },
            }
          : {}),
      });
    } catch (error) {
      sendComposioError(
        res,
        error,
      );
    }
  },
);

/**
 * Search the full action-capability surface for Plugin detail views.
 *
 * This endpoint only returns metadata. It never executes a tool. Mutating and
 * destructive tools still go through the existing execution confirmation path.
 */
router.post(
  '/xroga-connect/action-search',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      query: z.string().trim().min(2).max(500),
      sessionId: z
        .string()
        .trim()
        .regex(/^trs_[A-Za-z0-9_-]+$/)
        .optional(),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const result = await searchComposioActionTools(
        req.userId!,
        parsed.data,
      );

      res.json({
        ok: true,
        ...result,
        tools: result.tools.filter(
          (tool) =>
            canUserAccessComposioToolkit(req.userId!, tool.toolkit) &&
            canUserAccessComposioToolSlug(req.userId!, tool.slug),
        ),
        toolkits: result.toolkits.filter((toolkit) =>
          canUserAccessComposioToolkit(req.userId!, toolkit.toolkit),
        ),
        ...(result.skill
          ? {
              skill: {
                ...result.skill,
                primaryToolSlugs: result.skill.primaryToolSlugs.filter((slug) =>
                  canUserAccessComposioToolSlug(req.userId!, slug),
                ),
                relatedToolSlugs: result.skill.relatedToolSlugs.filter((slug) =>
                  canUserAccessComposioToolSlug(req.userId!, slug),
                ),
              },
            }
          : {}),
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

/**
 * List real toolkit metadata from the current Xroga Connect session.
 *
 * Connected-only mode powers the Connected management view without guessing
 * connection state from whichever providers happened to match a search query.
 */
router.post(
  '/xroga-connect/toolkits',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      sessionId: z
        .string()
        .trim()
        .regex(/^trs_[A-Za-z0-9_-]+$/),
      connectedOnly: z.boolean().optional().default(false),
      toolkits: z
        .array(
          z
            .string()
            .trim()
            .min(2)
            .max(80)
            .regex(/^[A-Za-z0-9_-]+$/),
        )
        .max(100)
        .optional(),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const input = {
        sessionId: parsed.data.sessionId,
        ...(parsed.data.toolkits
          ? { toolkits: parsed.data.toolkits }
          : {}),
      };

      const toolkits = parsed.data.connectedOnly
        ? await listConnectedComposioToolkits(req.userId!, input)
        : await listComposioToolkits(req.userId!, input);

      res.json({
        ok: true,
        toolkits: toolkits.filter((toolkit) =>
          canUserAccessComposioToolkit(req.userId!, toolkit.toolkit),
        ),
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

/**
 * User-scoped Custom MCP servers.
 *
 * The upstream project catalogue is shared, so every Xroga-created custom
 * toolkit is namespaced by the authenticated user before it is registered.
 */
router.get(
  '/xroga-connect/custom-mcp',
  async (
    req: AuthRequest,
    res,
  ) => {
    try {
      const items = await listUserCustomMcpToolkits(req.userId!);

      res.json({
        ok: true,
        items,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.post(
  '/xroga-connect/custom-mcp',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(80),
      serverUrl: z.string().trim().url().max(1000),
      authMode: z.enum(['none', 'api_key', 'dcr_oauth']),
      headerName: z.string().trim().min(1).max(80).optional(),
      headerPrefix: z.string().max(80).optional(),
      discoveryUrl: z.string().trim().url().max(1000).optional(),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const result = await createUserCustomMcpToolkit(
        req.userId!,
        parsed.data,
      );

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.post(
  '/xroga-connect/custom-mcp/:toolkit/sync',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/^[A-Za-z0-9_-]+$/),
      connectedAccountId: z
        .string()
        .trim()
        .min(3)
        .max(200)
        .optional(),
    });

    const parsed = schema.safeParse({
      toolkit: req.params.toolkit,
      connectedAccountId: req.body?.connectedAccountId,
    });

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const result = await syncUserCustomMcpToolkit(
        req.userId!,
        {
          toolkit: parsed.data.toolkit,
          ...(parsed.data.connectedAccountId
            ? { connectedAccountId: parsed.data.connectedAccountId }
            : {}),
        },
      );

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

router.delete(
  '/xroga-connect/custom-mcp/:toolkit',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema = z.object({
      toolkit: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/^[A-Za-z0-9_-]+$/),
    });

    const parsed = schema.safeParse({
      toolkit: req.params.toolkit,
    });

    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.flatten(),
      });
      return;
    }

    try {
      const result = await deleteUserCustomMcpToolkit(
        req.userId!,
        parsed.data.toolkit,
      );

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      sendComposioError(res, error);
    }
  },
);

/**
 * Create a Composio-managed
 * OAuth/authentication link.
 */
router.post(
  '/xroga-connect/link',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        sessionId: z
          .string()
          .trim()
          .regex(
            /^trs_[A-Za-z0-9_-]+$/,
          ),

        toolkit: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(
            /^[A-Za-z0-9_-]+$/,
          ),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        ok: false,

        error:
          parsed.error.flatten(),
      });

      return;
    }

    if (!canUserAccessComposioToolkit(req.userId!, parsed.data.toolkit)) {
      res.status(404).json({
        ok: false,
        error: 'Plugin not found.',
      });
      return;
    }

    const frontendUrl =
      process.env
        .FRONTEND_URL
        ?.trim() ||
      'https://xroga.com';

    const callbackUrl =
      `${frontendUrl.replace(
        /\/$/,
        '',
      )}/dashboard/integrations/connect/callback`;

    try {
      const result =
        await createComposioConnectionLink(
          req.userId!,
          {
            sessionId:
              parsed.data
                .sessionId,

            toolkit:
              parsed.data
                .toolkit,

            callbackUrl,
          },
        );

      res.json({
        ok: true,

        ...result,
      });
    } catch (error) {
      sendComposioError(
        res,
        error,
      );
    }
  },
);

/**
 * Execute ONLY a tool that
 * survives the read-only session
 * policy and re-discovery check.
 */
router.post(
  '/xroga-connect/execute',
  async (
    req: AuthRequest,
    res,
  ) => {
    const schema =
      z.object({
        sessionId: z
          .string()
          .trim()
          .regex(
            /^trs_[A-Za-z0-9_-]+$/,
          ),

        useCase: z
          .string()
          .trim()
          .min(2)
          .max(500),

        toolSlug: z
          .string()
          .trim()
          .min(3)
          .max(200)
          .regex(
            /^[A-Za-z0-9_-]+$/,
          ),

        arguments: z
          .record(
            z.string(),
            z.unknown(),
          )
          .default({}),
      });

    const parsed =
      schema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        ok: false,

        error:
          parsed.error.flatten(),
      });

      return;
    }

    try {
      const result =
        await executeComposioReadTool(
          req.userId!,
          parsed.data,
        );

      res.json({
        ok: true,

        result,
      });
    } catch (error) {
      sendComposioError(
        res,
        error,
      );
    }
  },
);

/**
 * Live-AI proxy stays retired —
 * keys belong to the user's product
 * on Vercel, not Xroga chat.
 */
router.use(
  '/live-ai',
  (_req, res) =>
    retiredJson(res),
);

router.use(
  '/search',
  (_req, res) =>
    retiredJson(res),
);

export default router;