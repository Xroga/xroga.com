import type {
  BuildRecipe,
} from './buildRecipes.js';

import type {
  NichePack,
} from './nichePacks.js';

import type {
  ProductClassification,
} from './productTaxonomy.js';

export const GOLDEN_EXAMPLE_SCHEMA_VERSION =
  '1.0.0' as const;

export interface GoldenExample {
  readonly schemaVersion:
    typeof GOLDEN_EXAMPLE_SCHEMA_VERSION;

  readonly id:
    string;

  readonly taxonomyIds:
    readonly string[];

  readonly recipeIds:
    readonly string[];

  readonly nicheIds:
    readonly string[];

  readonly summary:
    string;

  readonly fileShape:
    readonly string[];

  readonly lessons:
    readonly string[];

  readonly avoid:
    readonly string[];
}

const EXAMPLES:
  readonly GoldenExample[] = [
  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'portfolio.complete',

    taxonomyIds: [
      'web.portfolio',
    ],

    recipeIds: [
      'web.portfolio',
    ],

    nicheIds: [
      'photography',
    ],

    summary:
      'A complete portfolio centers the work itself and provides identity, context and a contact path.',

    fileShape: [
      'entry/page',
      'responsive styles',
      'gallery/content components',
      'project documentation',
    ],

    lessons: [
      'The hero must identify whose work is being shown.',
      'The portfolio/gallery is a primary product surface, not a decorative footer section.',
      'Mobile gallery behavior is part of completeness.',
    ],

    avoid: [
      'Do not replace the portfolio with a generic corporate landing page.',
      'Do not invent awards or clients.',
    ],
  },

  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'dashboard.application',

    taxonomyIds: [
      'web.dashboard',
    ],

    recipeIds: [
      'web.dashboard',
    ],

    nicheIds:
      [],

    summary:
      'A dashboard is an application workspace with navigation, state and usable data presentation.',

    fileShape: [
      'application entry',
      'dashboard components',
      'styles',
      'manifest',
    ],

    lessons: [
      'A dashboard needs loading, empty and populated states.',
      'Data presentation must remain usable on smaller screens.',
      'Navigation should represent product workflows.',
    ],

    avoid: [
      'Do not turn a dashboard request into a marketing landing page.',
    ],
  },

  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'cli.rust',

    taxonomyIds: [
      'cli.tool',
    ],

    recipeIds: [
      'cli.generic',
    ],

    nicheIds:
      [],

    summary:
      'A CLI is complete when arguments, deterministic output, error handling and packaging work from a terminal.',

    fileShape: [
      'Cargo.toml',
      'src/main.rs',
      'tests/cli.rs',
      'README.md',
    ],

    lessons: [
      '--help is part of the user interface.',
      'Exit codes are observable product behavior.',
      'Representative invocation tests are more useful than a website preview.',
    ],

    avoid: [
      'Never create HTML simply because no web framework was specified.',
    ],
  },

  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'api.fastapi',

    taxonomyIds: [
      'api.rest',
    ],

    recipeIds: [
      'api.service',
    ],

    nicheIds:
      [],

    summary:
      'An API service is complete when it starts, validates input and returns tested response contracts.',

    fileShape: [
      'pyproject.toml',
      'app/main.py',
      'tests/test_api.py',
      'README.md',
    ],

    lessons: [
      'Health/startup evidence is separate from endpoint correctness.',
      'Invalid requests need explicit verification.',
    ],

    avoid: [
      'Do not create a frontend unless a frontend surface is requested.',
    ],
  },

  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'extension.mv3',

    taxonomyIds: [
      'extension.browser',
    ],

    recipeIds: [
      'extension.browser',
    ],

    nicheIds:
      [],

    summary:
      'A browser extension is defined by its manifest, permissions and browser entry points.',

    fileShape: [
      'manifest.json',
      'package.json',
      'browser entries',
      'README.md',
    ],

    lessons: [
      'Manifest paths must resolve to real outputs.',
      'Permissions should match actual behavior.',
    ],

    avoid: [
      'Do not request broad browser permissions without requirement evidence.',
    ],
  },

  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'rag.service',

    taxonomyIds: [
      'ai.rag',
    ],

    recipeIds: [
      'ai.rag',
    ],

    nicheIds:
      [],

    summary:
      'A RAG product separates deterministic retrieval evidence from probabilistic generation.',

    fileShape: [
      'project manifest',
      'pipeline entry',
      'retrieval implementation',
      'evaluation tests',
    ],

    lessons: [
      'Test retrieval before judging generated text.',
      'Provider credentials remain outside model-visible source.',
    ],

    avoid: [
      'Do not treat model confidence as verification.',
    ],
  },

  {
    schemaVersion:
      GOLDEN_EXAMPLE_SCHEMA_VERSION,

    id:
      'mcp.server',

    taxonomyIds: [
      'ai.mcp_server',
    ],

    recipeIds: [
      'ai.mcp_server',
    ],

    nicheIds:
      [],

    summary:
      'An MCP server is a structured tool surface with validated schemas and deterministic tool behavior.',

    fileShape: [
      'package.json',
      'src/index.ts',
      'src/tools.ts',
      'tests/server.test.ts',
    ],

    lessons: [
      'Tool schemas are part of the public contract.',
      'External side effects need validated inputs.',
    ],

    avoid: [
      'Do not expose arbitrary shell or filesystem access without an explicit bounded contract.',
    ],
  },
];

export function goldenExamples():
  readonly GoldenExample[] {
  return EXAMPLES;
}

export function selectGoldenExamples(
  input: {
    classification:
      ProductClassification | null;

    recipe:
      BuildRecipe | null;

    nichePack:
      NichePack | null;

    limit?:
      number;
  },
): readonly GoldenExample[] {
  const taxonomyId =
    input.classification
      ?.taxonomyId;

  const recipeId =
    input.recipe
      ?.id;

  const nicheId =
    input.nichePack
      ?.id;

  return EXAMPLES
    .map(
      (
        example,
      ) => {
        let score =
          0;

        if (
          taxonomyId &&
          example.taxonomyIds.includes(
            taxonomyId,
          )
        ) {
          score +=
            100;
        }

        if (
          recipeId &&
          example.recipeIds.includes(
            recipeId,
          )
        ) {
          score +=
            60;
        }

        if (
          nicheId &&
          example.nicheIds.includes(
            nicheId,
          )
        ) {
          score +=
            25;
        }

        return {
          example,
          score,
        };
      },
    )
    .filter(
      (
        item,
      ) =>
        item.score >
        0,
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.score -
        left.score,
    )
    .slice(
      0,
      input.limit ??
        2,
    )
    .map(
      (
        item,
      ) =>
        item.example,
    );
}
