/**
 * Choosing a stack from requirements and repository evidence.
 *
 * This replaces `architect.ts`, which asked a model for `"stack": "static|nextjs|expo|other"`
 * and fell back to `'static'` when the reply did not parse. Three things were wrong with
 * that, and they compound.
 *
 * The vocabulary could not name most software. There is no value for a Rust binary, a
 * Python wheel, a Terraform module or a Gradle service, so those requests were not
 * rejected — they were mapped onto whichever of four tokens was least wrong.
 *
 * The fallback was silent and pointed at the most misleading answer available. A parse
 * failure produced a static website, which builds and deploys and looks like success. A
 * refusal would have been recoverable; a plausible wrong artefact is not.
 *
 * And nothing recorded *why*. A decision with no reason cannot be reviewed, cannot be
 * inherited by a follow-up request (§51), and cannot be argued with when it is wrong.
 *
 * So: decisions carry evidence, an existing repository outranks any preference, and when
 * there is genuinely not enough information the plan says so. `confidence: 0` with a
 * blocker is a legitimate output here. It is the one thing the previous design could not
 * express.
 */

import type {
  ProjectFile,
} from '../ai/patches.js';

import type {
  ProductSurface,
  UniversalProductSpec,
} from './universalProductSpec.js';

import {
  detectComposition,
  type RepositoryComposition,
} from './runtime/registry.js';

import {
  discoverRepository,
} from './runtime/repositoryDiscovery.js';

export const ARCHITECTURE_PLAN_SCHEMA_VERSION =
  '1.0.0' as const;

/**
 * One choice, with everything needed to review it.
 *
 * §6 lists these fields; the ones that earn their place are
 * `alternativesConsidered` and `inheritedFromRepository`.
 */
export interface ArchitectureDecision {
  readonly id: string;

  readonly category:
    | 'language'
    | 'runtime'
    | 'framework'
    | 'package_manager'
    | 'build_system'
    | 'database'
    | 'deployment'
    | 'packaging';

  readonly selection: string;

  readonly reason: string;

  readonly requirementEvidence:
    readonly string[];

  readonly repositoryEvidence:
    readonly string[];

  readonly alternativesConsidered:
    readonly string[];

  readonly tradeoffs:
    readonly string[];

  readonly confidence:
    number;

  /**
   * True when the repository already made this choice and it is being
   * respected.
   */
  readonly inheritedFromRepository:
    boolean;

  readonly authorizationRequired:
    boolean;

  readonly validationMethod:
    string;
}

export interface PlannedComponent {
  readonly id:
    string;

  readonly root:
    string;

  readonly surfaces:
    readonly ProductSurface[];

  readonly language:
    string | null;

  readonly runtime:
    string | null;

  readonly framework:
    string | null;

  readonly packageManager:
    string | null;

  readonly buildSystem:
    string | null;

  readonly adapterId:
    string | null;

  /**
   * Set when no adapter can build this component.
   */
  readonly blocker:
    string | null;
}

export interface ArchitecturePlan {
  readonly schemaVersion:
    string;

  readonly components:
    readonly PlannedComponent[];

  readonly decisions:
    readonly ArchitectureDecision[];

  readonly blockers:
    readonly string[];

  readonly unresolvedQuestions:
    readonly string[];

  /**
   * True when an existing repository determined the stack.
   */
  readonly inheritedFromRepository:
    boolean;

  readonly createdAt:
    string;
}

/**
 * Default language per surface, used only for greenfield work.
 *
 * These are starting points, not rules — every one is overridden by an
 * explicit request and by any existing repository.
 *
 * web_frontend still defaults to Next.js for a general browser application.
 * A recognised simple landing/static site is handled separately below by
 * wantsStaticWeb(), so we do not force npm/Next.js onto dependency-free
 * HTML/CSS/JavaScript work.
 */
const SURFACE_DEFAULTS:
  Readonly<
    Record<
      string,
      {
        language:
          string;

        runtime:
          string;

        framework:
          string | null;

        reason:
          string;
      }
    >
  > = {
    cli: {
      language:
        'rust',

      runtime:
        'native',

      framework:
        null,

      reason:
        'a CLI benefits from a single self-contained binary with no runtime to install',
    },

    api: {
      language:
        'python',

      runtime:
        'cpython',

      framework:
        'fastapi',

      reason:
        'FastAPI gives schema validation and generated API documentation without extra work',
    },

    worker: {
      language:
        'python',

      runtime:
        'cpython',

      framework:
        null,

      reason:
        'background processing needs no HTTP framework',
    },

    scheduled_job: {
      language:
        'python',

      runtime:
        'cpython',

      framework:
        null,

      reason:
        'a scheduled task is a plain program invoked by a scheduler',
    },

    data_pipeline: {
      language:
        'python',

      runtime:
        'cpython',

      framework:
        null,

      reason:
        'the data ecosystem is strongest in Python',
    },

    etl: {
      language:
        'python',

      runtime:
        'cpython',

      framework:
        null,

      reason:
        'the data ecosystem is strongest in Python',
    },

    ai_pipeline: {
      language:
        'python',

      runtime:
        'cpython',

      framework:
        null,

      reason:
        'model tooling is Python-first',
    },

    web_frontend: {
      language:
        'typescript',

      runtime:
        'node',

      framework:
        'next',

      reason:
        'a full browser application benefits from routing and rendering support when no simpler architecture was requested',
    },

    browser_extension: {
      language:
        'typescript',

      runtime:
        'browser',

      framework:
        null,

      reason:
        'extension APIs are JavaScript and the manifest defines the structure',
    },

    mobile_app: {
      language:
        'dart',

      runtime:
        'flutter',

      framework:
        'flutter',

      reason:
        'one codebase covering both mobile platforms',
    },

    desktop_app: {
      language:
        'rust',

      runtime:
        'tauri',

      framework:
        'tauri',

      reason:
        'a native binary with a web view, far smaller than bundling a browser',
    },

    library: {
      language:
        'typescript',

      runtime:
        'node',

      framework:
        null,

      reason:
        'no stronger signal is present; overridden by any stated language',
    },

    smart_contract: {
      language:
        'solidity',

      runtime:
        'evm',

      framework:
        'foundry',

      reason:
        'Foundry tests contracts in Solidity itself',
    },

    infrastructure_module: {
      language:
        'hcl',

      runtime:
        'terraform',

      framework:
        null,

      reason:
        'the request describes declarative infrastructure',
    },

    mcp_server: {
      language:
        'typescript',

      runtime:
        'node',

      framework:
        null,

      reason:
        'the reference MCP SDK is TypeScript',
    },

    game: {
      language:
        'typescript',

      runtime:
        'node',

      framework:
        null,

      reason:
        'no stronger signal is present; overridden by any stated engine',
    },
  };

/**
 * Languages a user can name outright, which always beat a default where
 * the target surface can actually use that language.
 */
const EXPLICIT_LANGUAGES:
  ReadonlyArray<
    [
      RegExp,
      string,
      string,
    ]
  > = [
    [
      /\brust\b/i,
      'rust',
      'native',
    ],

    [
      /\bpython\b/i,
      'python',
      'cpython',
    ],

    [
      /\b(typescript|node(?:\.js)?)\b/i,
      'typescript',
      'node',
    ],

    [
      /\bjavascript\b/i,
      'javascript',
      'node',
    ],

    [
      /\bgo(?:lang)?\b/i,
      'go',
      'go',
    ],

    [
      /\bjava\b/i,
      'java',
      'jvm',
    ],

    [
      /\bkotlin\b/i,
      'kotlin',
      'jvm',
    ],

    [
      /\b(c#|csharp|\.net|dotnet)\b/i,
      'csharp',
      'dotnet',
    ],

    [
      /\bphp\b/i,
      'php',
      'php',
    ],

    [
      /\bruby\b/i,
      'ruby',
      'ruby',
    ],

    [
      /\b(dart|flutter)\b/i,
      'dart',
      'flutter',
    ],

    [
      /\bswift\b/i,
      'swift',
      'native',
    ],

    [
      /\belixir\b/i,
      'elixir',
      'beam',
    ],

    [
      /\bzig\b/i,
      'zig',
      'native',
    ],

    [
      /\bscala\b/i,
      'scala',
      'jvm',
    ],

    [
      /\bsolidity\b/i,
      'solidity',
      'evm',
    ],

    [
      /\bc\+\+\b/i,
      'cpp',
      'native',
    ],
  ];

/**
 * Frameworks a user can name outright.
 */
const EXPLICIT_FRAMEWORKS:
  ReadonlyArray<
    [
      RegExp,
      string,
      string,
    ]
  > = [
    [
      /\bfastapi\b/i,
      'fastapi',
      'python',
    ],

    [
      /\bdjango\b/i,
      'django',
      'python',
    ],

    [
      /\bflask\b/i,
      'flask',
      'python',
    ],

    [
      /\bnext\.?js\b/i,
      'next',
      'typescript',
    ],

    [
      /\breact\b/i,
      'react',
      'typescript',
    ],

    [
      /\bvue\b/i,
      'vue',
      'typescript',
    ],

    [
      /\bsvelte(?:kit)?\b/i,
      'svelte',
      'typescript',
    ],

    [
      /\bexpress\b/i,
      'express',
      'typescript',
    ],

    [
      /\bfastify\b/i,
      'fastify',
      'typescript',
    ],

    [
      /\bspring(?: boot)?\b/i,
      'spring-boot',
      'java',
    ],

    [
      /\blaravel\b/i,
      'laravel',
      'php',
    ],

    [
      /\brails\b/i,
      'rails',
      'ruby',
    ],

    [
      /\bgin\b/i,
      'gin',
      'go',
    ],

    [
      /\baxum\b/i,
      'axum',
      'rust',
    ],

    [
      /\bactix\b/i,
      'actix',
      'rust',
    ],

    [
      /\bphoenix\b/i,
      'phoenix',
      'elixir',
    ],

    [
      /\bflutter\b/i,
      'flutter',
      'dart',
    ],

    [
      /\bfoundry\b/i,
      'foundry',
      'solidity',
    ],

    [
      /\bhardhat\b/i,
      'hardhat',
      'typescript',
    ],
  ];

const DATABASES:
  ReadonlyArray<
    [
      RegExp,
      string,
    ]
  > = [
    [
      /\bpostgres(?:ql)?\b/i,
      'postgresql',
    ],

    [
      /\bmysql\b/i,
      'mysql',
    ],

    [
      /\bsqlite\b/i,
      'sqlite',
    ],

    [
      /\bmongo(?:db)?\b/i,
      'mongodb',
    ],

    [
      /\bredis\b/i,
      'redis',
    ],

    [
      /\bdynamodb\b/i,
      'dynamodb',
    ],

    [
      /\bsupabase\b/i,
      'supabase',
    ],
  ];

function explicitLanguage(
  prompt:
    string,
):
  | {
      language:
        string;

      runtime:
        string;

      matched:
        string;
    }
  | null {
  for (
    const [
      pattern,
      language,
      runtime,
    ] of
    EXPLICIT_LANGUAGES
  ) {
    const match =
      prompt.match(
        pattern,
      );

    if (match) {
      return {
        language,
        runtime,
        matched:
          match[0],
      };
    }
  }

  return null;
}

function explicitFramework(
  prompt:
    string,
):
  | {
      framework:
        string;

      language:
        string;

      matched:
        string;
    }
  | null {
  for (
    const [
      pattern,
      framework,
      language,
    ] of
    EXPLICIT_FRAMEWORKS
  ) {
    const match =
      prompt.match(
        pattern,
      );

    if (match) {
      return {
        framework,
        language,
        matched:
          match[0],
      };
    }
  }

  return null;
}

/**
 * A recognised simple web request should not be inflated into a framework
 * application when the user did not ask for one.
 *
 * This is deliberately NOT a global "unknown => static" fallback.
 *
 * The request must already have resolved to a web_frontend surface and must
 * carry positive evidence that a dependency-free browser implementation is
 * appropriate:
 *
 * - landing page
 * - HTML + CSS
 * - explicit static site
 * - plain HTML
 * - vanilla JavaScript
 *
 * If React, Next.js, Vue, Svelte or another framework is explicitly named,
 * that explicit framework wins and static mode is disabled.
 */
function wantsStaticWeb(
  prompt:
    string,

  statedFramework:
    ReturnType<
      typeof explicitFramework
    >,
): boolean {
  if (
    statedFramework
  ) {
    return false;
  }

  const landingPage =
    /\blanding\s+page\b/i.test(
      prompt,
    );

  const explicitHtmlCss =
    /\bhtml\b/i.test(
      prompt,
    ) &&
    /\bcss\b/i.test(
      prompt,
    );

  const explicitStatic =
    /\b(?:static\s+(?:site|website|web\s*page)|plain\s+html|vanilla\s+(?:js|javascript))\b/i.test(
      prompt,
    );

  return (
    landingPage ||
    explicitHtmlCss ||
    explicitStatic
  );
}

/**
 * Builds a plan for an existing repository.
 *
 * Existing repository evidence outranks greenfield defaults.
 */
function planFromRepository(
  spec:
    UniversalProductSpec,

  composition:
    RepositoryComposition,

  files:
    readonly ProjectFile[],

  discovery =
    discoverRepository(
      files,
    ),
): ArchitecturePlan {
  const components:
    PlannedComponent[] =
    [];

  const decisions:
    ArchitectureDecision[] =
    [];

  const blockers:
    string[] =
    [];

  for (
    const component of
    composition.components
  ) {
    const {
      inspection,
    } =
      component;

    const language =
      inspection
        .languages[0] ??
      null;

    components.push({
      id:
        `component:${component.root || 'root'}`,

      root:
        component.root,

      surfaces:
        spec.surfaces.map(
          (
            declaration,
          ) =>
            declaration
              .surface,
        ),

      language,

      runtime:
        component.adapterId,

      framework:
        null,

      packageManager:
        inspection
          .packageManager,

      buildSystem:
        inspection
          .buildSystem,

      adapterId:
        component.adapterId,

      blocker:
        null,
    });

    decisions.push({
      id:
        `language:${component.root || 'root'}`,

      category:
        'language',

      selection:
        language ??
        'unknown',

      reason:
        'the repository already uses this language; extending it is cheaper and safer than migrating',

      requirementEvidence:
        [],

      repositoryEvidence: [
        ...inspection.evidence,
      ],

      alternativesConsidered: [
        'migrate to another language',
      ],

      tradeoffs: [
        'a migration would need behavioural characterisation tests first (§27)',
      ],

      confidence:
        1,

      inheritedFromRepository:
        true,

      authorizationRequired:
        false,

      validationMethod:
        `run the ${component.adapterId} adapter's test command`,
    });
  }

  /*
   * Recognised but unbuildable is the specific blocker that stops a
   * repository from being regenerated as an unrelated stack.
   */
  for (
    const signal of
    discovery.unsupported
  ) {
    const blocker =
      `${
        signal.displayName
      } at ${
        signal.root ||
        '.'
      } is recognised (${
        signal.markers.join(
          ', ',
        )
      }) but no runtime adapter can build it. Nothing was executed for this component.`;

    blockers.push(
      blocker,
    );

    components.push({
      id:
        `component:${signal.root || 'root'}:${signal.ecosystem}`,

      root:
        signal.root,

      surfaces:
        [],

      language:
        signal.ecosystem,

      runtime:
        null,

      framework:
        null,

      packageManager:
        signal
          .packageManager,

      buildSystem:
        signal
          .buildSystem,

      adapterId:
        null,

      blocker,
    });
  }

  /*
   * A tree that matched no known adapter is still an existing repository
   * and must never silently become a greenfield project.
   */
  if (
    !components.length
  ) {
    const languages =
      [
        ...new Set(
          discovery
            .generic
            .filter(
              (
                signal,
              ) =>
                signal.kind ===
                'extension',
            )
            .map(
              (
                signal,
              ) =>
                signal.detail
                  .replace(
                    /^\d+\s+/,
                    '',
                  )
                  .replace(
                    /\s+source file\(s\)$/,
                    '',
                  ),
            ),
        ),
      ];

    const blocker =
      `The repository uses a toolchain no runtime adapter recognises` +
      (
        languages.length
          ? ` (${languages.join(', ')} sources found)`
          : ''
      ) +
      '. Build and test commands must be discovered from repository evidence before anything can run.';

    blockers.push(
      blocker,
    );

    components.push({
      id:
        'component:root',

      root:
        '',

      surfaces:
        spec.surfaces.map(
          (
            declaration,
          ) =>
            declaration
              .surface,
        ),

      language:
        languages[0] ??
        null,

      runtime:
        null,

      framework:
        null,

      packageManager:
        null,

      buildSystem:
        null,

      adapterId:
        null,

      blocker,
    });
  }

  return {
    schemaVersion:
      ARCHITECTURE_PLAN_SCHEMA_VERSION,

    components,

    decisions,

    blockers,

    unresolvedQuestions:
      [],

    inheritedFromRepository:
      true,

    createdAt:
      new Date()
        .toISOString(),
  };
}

/**
 * Plans an architecture from a spec and, when present, a repository.
 *
 * Precedence:
 *
 * 1. existing repository
 * 2. explicit framework / architecture requested by the user
 * 3. recognised dependency-free static-web request
 * 4. explicit language where coherent
 * 5. surface default
 */
export function planArchitecture(
  input: {
    spec:
      UniversalProductSpec;

    files?:
      readonly ProjectFile[];
  },
): ArchitecturePlan {
  const files =
    input.files ??
    [];

  const spec =
    input.spec;

  const prompt =
    spec.sourcePrompt ??
    '';

  /*
   * Existing repository facts always outrank greenfield defaults.
   */
  if (
    files.length
  ) {
    const composition =
      detectComposition(
        files,
      );

    const discovery =
      discoverRepository(
        files,
      );

    /*
     * `needsRuntimeDiscovery` belongs in this condition too.
     *
     * An existing tree is a fact regardless of whether a built-in adapter
     * understands it.
     */
    if (
      composition
        .components
        .length ||
      discovery
        .unsupported
        .length ||
      discovery
        .needsRuntimeDiscovery
    ) {
      return planFromRepository(
        spec,
        composition,
        files,
        discovery,
      );
    }
  }

  /*
   * No surfaces means the request was genuinely not understood.
   *
   * Do NOT convert this case into static-web. Static web is selected only
   * when the product spec already established a browser surface and the
   * request gives positive static-site evidence.
   */
  if (
    !spec
      .surfaces
      .length
  ) {
    return {
      schemaVersion:
        ARCHITECTURE_PLAN_SCHEMA_VERSION,

      components:
        [],

      decisions:
        [],

      blockers: [
        'No product surface could be determined, so no architecture was selected. ' +
          'Nothing was generated. This is deliberate: defaulting to a static website here is what made ' +
          'unfamiliar requests silently produce the wrong artefact.',
      ],

      unresolvedQuestions: [
        ...spec.unresolvedQuestions,
      ],

      inheritedFromRepository:
        false,

      createdAt:
        new Date()
          .toISOString(),
    };
  }

  const decisions:
    ArchitectureDecision[] =
    [];

  const components:
    PlannedComponent[] =
    [];

  const blockers:
    string[] =
    [];

  const stated =
    explicitLanguage(
      prompt,
    );

  const statedFramework =
    explicitFramework(
      prompt,
    );

  for (
    const declaration of
    spec.surfaces
  ) {
    const surface =
      declaration
        .surface as string;

    const fallback =
      SURFACE_DEFAULTS[
        surface
      ];

    /*
     * Only a real web_frontend may become static-web.
     *
     * Unknown products are still refused upstream.
     */
    const staticWeb =
      surface ===
        'web_frontend' &&
      wantsStaticWeb(
        prompt,
        statedFramework,
      );

    /*
     * A named non-browser language may override a default where coherent.
     *
     * Browser interfaces must remain browser-executable. A user mentioning
     * Java in prose must not turn a landing page into a JVM application.
     */
    const browserBound =
      surface ===
        'web_frontend' ||
      surface ===
        'browser_extension';

    const useStated =
      Boolean(
        stated,
      ) &&
      !browserBound;

    const language =
      staticWeb
        ? 'html'
        : useStated
          ? stated!
              .language
          : fallback
              ?.language ??
            null;

    const runtime =
      staticWeb
        ? 'browser'
        : useStated
          ? stated!
              .runtime
          : fallback
              ?.runtime ??
            null;

    let framework:
      string |
      null =
      staticWeb
        ? null
        : fallback
            ?.framework ??
          null;

    /*
     * An explicit framework wins over the generic surface default.
     *
     * staticWeb is already false whenever a supported explicit framework
     * was identified, so the two modes cannot conflict.
     */
    if (
      !staticWeb &&
      statedFramework &&
      (
        !language ||
        statedFramework
          .language ===
          language
      )
    ) {
      framework =
        statedFramework.framework;
    }

    if (
      !language
    ) {
      const blocker =
        `Surface "${surface}" has no default language and none was stated, so no stack was selected for it. Nothing was generated for this surface.`;

      blockers.push(
        blocker,
      );

      components.push({
        id:
          `component:${surface}`,

        root:
          surface,

        surfaces: [
          declaration
            .surface,
        ],

        language:
          null,

        runtime:
          null,

        framework:
          null,

        packageManager:
          null,

        buildSystem:
          null,

        adapterId:
          null,

        blocker,
      });

      continue;
    }

    /*
     * static-web is a first-class runtime adapter rather than a special
     * validation bypass.
     */
    const adapterId =
      staticWeb
        ? 'static-web'
        : language ===
            'rust'
          ? 'rust'
          : language ===
              'python'
            ? 'python'
            : (
                language ===
                  'typescript' ||
                language ===
                  'javascript'
              )
              ? 'node'
              : null;

    const componentBlocker =
      adapterId
        ? null
        : `No runtime adapter implements ${language}, so this component can be planned but not built or validated.`;

    if (
      componentBlocker
    ) {
      blockers.push(
        `${surface}: ${componentBlocker}`,
      );
    }

    components.push({
      id:
        `component:${surface}`,

      /*
       * Single-surface products live at root. Multi-surface products get
       * one directory per surface.
       */
      root:
        spec.surfaces
          .length ===
        1
          ? ''
          : surface,

      surfaces: [
        declaration
          .surface,
      ],

      language,

      runtime,

      framework,

      /*
       * A dependency-free static website MUST NOT acquire npm merely
       * because it is rendered in a browser.
       */
      packageManager:
        adapterId ===
          'static-web'
          ? null
          : adapterId ===
              'rust'
            ? 'cargo'
            : adapterId ===
                'python'
              ? 'pip'
              : adapterId ===
                  'node'
                ? 'npm'
                : null,

      buildSystem:
        adapterId ===
          'static-web'
          ? null
          : adapterId ===
              'rust'
            ? 'cargo'
            : null,

      adapterId,

      blocker:
        componentBlocker,
    });

    decisions.push({
      id:
        `language:${surface}`,

      category:
        'language',

      selection:
        language,

      reason:
        staticWeb
          ? 'the request describes a landing/static HTML website and does not request a framework, so no package manager or dependency installation is required'
          : useStated
            ? `the request names ${stated!.matched} explicitly`
            : browserBound &&
                stated
              ? `${stated.language} cannot run directly in the browser, so this surface keeps ${language} while non-browser surfaces may use the stated language`
              : fallback
                  ?.reason ??
                'no stronger signal was available',

      requirementEvidence: [
        `surface ${surface}: ${declaration.reason}`,
        ...declaration.evidence,
      ],

      repositoryEvidence:
        [],

      alternativesConsidered:
        staticWeb
          ? [
              'Next.js',
              'React',
              'another package-managed web framework',
            ]
          : Object.entries(
              SURFACE_DEFAULTS,
            )
              .filter(
                ([
                  key,
                  value,
                ]) =>
                  key ===
                    surface &&
                  value.language !==
                    language,
              )
              .map(
                ([
                  ,
                  value,
                ]) =>
                  value.language,
              ),

      tradeoffs:
        staticWeb
          ? [
              'a framework remains appropriate if future requirements need framework-specific routing, rendering, or application state',
            ]
          : useStated
            ? []
            : [
                'a stated preference would override this default',
              ],

      confidence:
        staticWeb
          ? Math.max(
              declaration.confidence,
              0.9,
            )
          : useStated
            ? 0.95
            : declaration
                .confidence,

      inheritedFromRepository:
        false,

      authorizationRequired:
        false,

      validationMethod:
        adapterId
          ? `run the ${adapterId} adapter's test command`
          : 'no adapter available; cannot validate',
    });

    /*
     * static-web has no framework decision because "none" is deliberate
     * architecture, represented by framework: null on the component.
     */
    if (
      framework
    ) {
      decisions.push({
        id:
          `framework:${surface}`,

        category:
          'framework',

        selection:
          framework,

        reason:
          statedFramework
            ?.framework ===
          framework
            ? `the request names ${statedFramework.matched} explicitly`
            : fallback
                ?.reason ??
              'the surface default',

        requirementEvidence: [
          `surface ${surface}`,
        ],

        repositoryEvidence:
          [],

        alternativesConsidered:
          [],

        tradeoffs:
          [],

        confidence:
          statedFramework
            ?.framework ===
          framework
            ? 0.95
            : 0.6,

        inheritedFromRepository:
          false,

        authorizationRequired:
          false,

        validationMethod:
          'the framework must appear in the dependency manifest',
      });
    }
  }

  /*
   * A database is added only when the request actually asks for one.
   */
  const namedDatabase =
    DATABASES.find(
      ([
        pattern,
      ]) =>
        pattern.test(
          prompt,
        ),
    );

  if (
    namedDatabase
  ) {
    decisions.push({
      id:
        'database',

      category:
        'database',

      selection:
        namedDatabase[1],

      reason:
        'the request names this datastore',

      requirementEvidence: [
        `request mentions ${namedDatabase[1]}`,
      ],

      repositoryEvidence:
        [],

      alternativesConsidered:
        [],

      tradeoffs:
        [],

      confidence:
        0.95,

      inheritedFromRepository:
        false,

      authorizationRequired:
        false,

      validationMethod:
        'a migration or schema file must exist and apply',
    });
  } else if (
    spec
      .storageRequirements
      .length
  ) {
    decisions.push({
      id:
        'database',

      category:
        'database',

      selection:
        'sqlite',

      reason:
        'persistence is required but no datastore was named; SQLite needs no server and no credentials to validate',

      requirementEvidence:
        spec.storageRequirements,

      repositoryEvidence:
        [],

      alternativesConsidered: [
        'postgresql',
        'mysql',
        'mongodb',
      ],

      tradeoffs: [
        'SQLite does not cover multi-writer production load; migrating later is a schema change, not a rewrite',
      ],

      confidence:
        0.6,

      inheritedFromRepository:
        false,

      authorizationRequired:
        false,

      validationMethod:
        'a migration or schema file must exist and apply',
    });
  }

  return {
    schemaVersion:
      ARCHITECTURE_PLAN_SCHEMA_VERSION,

    components,

    decisions,

    blockers,

    unresolvedQuestions: [
      ...spec.unresolvedQuestions,
    ],

    inheritedFromRepository:
      false,

    createdAt:
      new Date()
        .toISOString(),
  };
}

/**
 * True when the plan chose nothing and said so, rather than choosing
 * badly.
 */
export function planIsRefusal(
  plan:
    ArchitecturePlan,
): boolean {
  return (
    plan.components
      .length ===
      0 &&
    plan.blockers
      .length >
      0
  );
}
