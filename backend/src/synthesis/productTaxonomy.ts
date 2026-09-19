import type {
  ProductSurface,
} from './universalProductSpec.js';

export const PRODUCT_TAXONOMY_SCHEMA_VERSION =
  '1.0.0' as const;

export type ProductTaxonomyMaturity =
  | 'supported'
  | 'beta'
  | 'experimental';

export interface ProductTaxonomyEntry {
  readonly schemaVersion:
    typeof PRODUCT_TAXONOMY_SCHEMA_VERSION;

  readonly id:
    string;

  readonly surface:
    ProductSurface;

  readonly subtype:
    string;

  readonly aliases:
    readonly string[];

  readonly capabilityHints:
    readonly string[];

  readonly domains:
    readonly string[];

  readonly defaultRecipeId:
    string | null;

  readonly maturity:
    ProductTaxonomyMaturity;

  readonly priority:
    number;
}

export interface ProductClassification {
  readonly taxonomyId:
    string | null;

  readonly surface:
    ProductSurface;

  readonly subtype:
    string | null;

  readonly domain:
    string | null;

  readonly capabilityHints:
    readonly string[];

  readonly defaultRecipeId:
    string | null;

  readonly confidence:
    number;

  readonly reasons:
    readonly string[];

  readonly custom:
    boolean;
}

export interface ProductClassificationInput {
  readonly text:
    string;

  readonly surfaces:
    readonly ProductSurface[];

  readonly explicitSubtype?:
    string | null;

  readonly explicitDomain?:
    string | null;
}

const ENTRIES:
  readonly ProductTaxonomyEntry[] = [
  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'web.landing',

    surface:
      'web_frontend',

    subtype:
      'landing_page',

    aliases: [
      'landing page',
      'marketing page',
      'launch page',
      'one page website',
      'one-page website',
      'product page',
    ],

    capabilityHints: [
      'responsive_layout',
      'content_sections',
      'call_to_action',
      'seo_basics',
    ],

    domains: [
      'agency',
      'startup',
      'saas',
      'business',
      'product',
      'restaurant',
      'dental',
    ],

    defaultRecipeId:
      'web.static_landing',

    maturity:
      'supported',

    priority:
      80,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'web.portfolio',

    surface:
      'web_frontend',

    subtype:
      'portfolio',

    aliases: [
      'portfolio',
      'personal portfolio',
      'photography portfolio',
      'photographer portfolio',
      'designer portfolio',
      'developer portfolio',
      'artist portfolio',
      'creative portfolio',
    ],

    capabilityHints: [
      'responsive_layout',
      'portfolio_gallery',
      'about_section',
      'contact',
      'seo_basics',
    ],

    domains: [
      'photography',
      'photographer',
      'design',
      'designer',
      'developer',
      'artist',
      'architecture',
      'creative',
    ],

    defaultRecipeId:
      'web.portfolio',

    maturity:
      'supported',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'web.dashboard',

    surface:
      'web_frontend',

    subtype:
      'dashboard',

    aliases: [
      'dashboard',
      'admin dashboard',
      'analytics dashboard',
      'control panel',
      'admin panel',
      'management console',
    ],

    capabilityHints: [
      'application_navigation',
      'data_visualisation',
      'tables',
      'forms',
      'interactive_state',
    ],

    domains: [
      'analytics',
      'admin',
      'operations',
      'finance',
      'sales',
      'management',
    ],

    defaultRecipeId:
      'web.dashboard',

    maturity:
      'supported',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'web.saas',

    surface:
      'web_frontend',

    subtype:
      'saas_application',

    aliases: [
      'saas',
      'saas app',
      'saas application',
      'software as a service',
      'web platform',
    ],

    capabilityHints: [
      'application_navigation',
      'authentication_candidate',
      'persistent_state_candidate',
      'forms',
      'interactive_state',
    ],

    domains: [
      'saas',
      'startup',
      'business',
      'productivity',
      'b2b',
    ],

    defaultRecipeId:
      'web.saas_application',

    maturity:
      'supported',

    priority:
      85,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'web.ecommerce',

    surface:
      'web_frontend',

    subtype:
      'ecommerce',

    aliases: [
      'ecommerce',
      'e-commerce',
      'online store',
      'storefront',
      'shopping site',
      'online shop',
    ],

    capabilityHints: [
      'catalog',
      'product_detail',
      'cart',
      'checkout_candidate',
      'search_candidate',
    ],

    domains: [
      'retail',
      'fashion',
      'commerce',
      'store',
      'shopping',
    ],

    defaultRecipeId:
      'web.ecommerce',

    maturity:
      'beta',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'web.documentation',

    surface:
      'documentation_site',

    subtype:
      'documentation',

    aliases: [
      'documentation',
      'documentation site',
      'docs site',
      'developer docs',
      'knowledge base',
    ],

    capabilityHints: [
      'documentation_navigation',
      'content_pages',
      'search_candidate',
      'code_examples_candidate',
    ],

    domains: [
      'developer',
      'api',
      'software',
      'product',
    ],

    defaultRecipeId:
      'web.documentation',

    maturity:
      'supported',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'api.rest',

    surface:
      'api',

    subtype:
      'rest_api',

    aliases: [
      'rest api',
      'restful api',
      'http api',
      'backend api',
      'api service',
      'crud api',
    ],

    capabilityHints: [
      'http_endpoints',
      'structured_validation',
      'error_responses',
      'health_endpoint',
    ],

    domains: [
      'backend',
      'service',
      'integration',
      'data',
    ],

    defaultRecipeId:
      'api.service',

    maturity:
      'supported',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'cli.tool',

    surface:
      'cli',

    subtype:
      'cli_tool',

    aliases: [
      'cli',
      'command line tool',
      'command-line tool',
      'terminal tool',
      'command line application',
    ],

    capabilityHints: [
      'command_arguments',
      'help_output',
      'exit_codes',
      'terminal_output',
    ],

    domains: [
      'developer',
      'automation',
      'files',
      'data',
    ],

    defaultRecipeId:
      'cli.generic',

    maturity:
      'supported',

    priority:
      110,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'extension.browser',

    surface:
      'browser_extension',

    subtype:
      'browser_extension',

    aliases: [
      'browser extension',
      'chrome extension',
      'firefox extension',
      'extension',
    ],

    capabilityHints: [
      'extension_manifest',
      'browser_permissions',
      'extension_runtime',
    ],

    domains: [
      'browser',
      'productivity',
      'developer',
      'automation',
    ],

    defaultRecipeId:
      'extension.browser',

    maturity:
      'beta',

    priority:
      110,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'mobile.application',

    surface:
      'mobile_app',

    subtype:
      'mobile_application',

    aliases: [
      'mobile app',
      'mobile application',
      'ios app',
      'android app',
    ],

    capabilityHints: [
      'mobile_navigation',
      'touch_interface',
      'device_layout',
    ],

    domains: [
      'mobile',
      'consumer',
      'business',
    ],

    defaultRecipeId:
      'mobile.application',

    maturity:
      'beta',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'desktop.application',

    surface:
      'desktop_app',

    subtype:
      'desktop_application',

    aliases: [
      'desktop app',
      'desktop application',
      'windows app',
      'mac app',
      'linux app',
    ],

    capabilityHints: [
      'desktop_window',
      'desktop_navigation',
      'local_runtime',
    ],

    domains: [
      'desktop',
      'productivity',
      'developer',
    ],

    defaultRecipeId:
      'desktop.application',

    maturity:
      'beta',

    priority:
      100,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'ai.rag',

    surface:
      'ai_pipeline',

    subtype:
      'rag_application',

    aliases: [
      'rag',
      'retrieval augmented generation',
      'knowledge assistant',
      'document question answering',
      'document qa',
    ],

    capabilityHints: [
      'document_ingestion',
      'retrieval',
      'model_generation',
      'evaluation_candidate',
    ],

    domains: [
      'ai',
      'documents',
      'knowledge',
      'search',
    ],

    defaultRecipeId:
      'ai.rag',

    maturity:
      'beta',

    priority:
      110,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'ai.mcp_server',

    surface:
      'mcp_server',

    subtype:
      'mcp_server',

    aliases: [
      'mcp server',
      'model context protocol server',
      'mcp tool server',
    ],

    capabilityHints: [
      'mcp_tools',
      'structured_tool_io',
      'stdio_or_http_transport',
    ],

    domains: [
      'ai',
      'developer',
      'integration',
    ],

    defaultRecipeId:
      'ai.mcp_server',

    maturity:
      'beta',

    priority:
      120,
  },

  {
    schemaVersion:
      PRODUCT_TAXONOMY_SCHEMA_VERSION,

    id:
      'worker.background',

    surface:
      'worker',

    subtype:
      'background_worker',

    aliases: [
      'background worker',
      'queue worker',
      'job worker',
      'worker service',
    ],

    capabilityHints: [
      'background_execution',
      'structured_logging',
      'graceful_failure',
    ],

    domains: [
      'automation',
      'backend',
      'processing',
    ],

    defaultRecipeId:
      'worker.background',

    maturity:
      'supported',

    priority:
      100,
  },
];

function normalize(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    );
}

function phrasePresent(
  text: string,
  phrase: string,
): boolean {
  return normalize(
    text,
  ).includes(
    normalize(
      phrase,
    ),
  );
}

function matchingDomain(
  text: string,
  domains:
    readonly string[],
  explicitDomain?:
    string | null,
): string | null {
  if (
    explicitDomain
      ?.trim()
  ) {
    return normalize(
      explicitDomain,
    );
  }

  for (
    const domain of
    domains
  ) {
    if (
      phrasePresent(
        text,
        domain,
      )
    ) {
      return domain;
    }
  }

  return null;
}

function matchesExplicitSubtype(
  entry:
    ProductTaxonomyEntry,

  subtype:
    string,
): boolean {
  const expected =
    normalize(
      subtype,
    );

  return (
    normalize(
      entry.subtype,
    ) === expected ||
    normalize(
      entry.id,
    ) === expected ||
    entry.aliases.some(
      (
        alias,
      ) =>
        normalize(
          alias,
        ) === expected,
    )
  );
}

export function productTaxonomyEntries():
  readonly ProductTaxonomyEntry[] {
  return ENTRIES;
}

export function productTaxonomyEntry(
  id: string,
): ProductTaxonomyEntry | null {
  return (
    ENTRIES.find(
      (
        entry,
      ) =>
        entry.id ===
        id,
    ) ??
    null
  );
}

export function classifyProduct(
  input:
    ProductClassificationInput,
): ProductClassification | null {
  if (
    !input.surfaces.length
  ) {
    return null;
  }

  const explicitSubtype =
    input.explicitSubtype
      ?.trim() ??
    '';

  if (
    explicitSubtype
  ) {
    const explicit =
      ENTRIES
        .filter(
          (
            entry,
          ) =>
            input.surfaces.includes(
              entry.surface,
            ),
        )
        .find(
          (
            entry,
          ) =>
            matchesExplicitSubtype(
              entry,
              explicitSubtype,
            ),
        );

    if (
      explicit
    ) {
      return {
        taxonomyId:
          explicit.id,

        surface:
          explicit.surface,

        subtype:
          explicit.subtype,

        domain:
          matchingDomain(
            input.text,
            explicit.domains,
            input.explicitDomain,
          ),

        capabilityHints:
          explicit.capabilityHints,

        defaultRecipeId:
          explicit.defaultRecipeId,

        confidence:
          0.99,

        reasons: [
          `Structured subtype "${explicitSubtype}" matched ${explicit.id}.`,
        ],

        custom:
          false,
      };
    }
  }

  const candidates =
    ENTRIES
      .filter(
        (
          entry,
        ) =>
          input.surfaces.includes(
            entry.surface,
          ),
      )
      .map(
        (
          entry,
        ) => {
          const aliasMatches =
            entry.aliases.filter(
              (
                alias,
              ) =>
                phrasePresent(
                  input.text,
                  alias,
                ),
            );

          const domain =
            matchingDomain(
              input.text,
              entry.domains,
              input.explicitDomain,
            );

          const score =
            (
              aliasMatches.length *
              100
            ) +
            (
              domain
                ? 15
                : 0
            ) +
            entry.priority;

          return {
            entry,
            aliasMatches,
            domain,
            score,
          };
        },
      )
      .filter(
        (
          candidate,
        ) =>
          candidate
            .aliasMatches
            .length >
          0,
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.score -
          left.score,
      );

  const selected =
    candidates[0];

  if (
    selected
  ) {
    return {
      taxonomyId:
        selected.entry.id,

      surface:
        selected.entry.surface,

      subtype:
        selected.entry.subtype,

      domain:
        selected.domain,

      capabilityHints:
        selected.entry
          .capabilityHints,

      defaultRecipeId:
        selected.entry
          .defaultRecipeId,

      confidence:
        Math.min(
          0.98,
          0.72 +
            (
              selected
                .aliasMatches
                .length *
              0.07
            ) +
            (
              selected.domain
                ? 0.05
                : 0
            ),
        ),

      reasons: [
        `Matched ${selected.entry.id} from ${selected.aliasMatches.join(', ')}.`,

        ...(selected.domain
          ? [
              `Domain signal: ${selected.domain}.`,
            ]
          : []),
      ],

      custom:
        false,
    };
  }

  return {
    taxonomyId:
      null,

    surface:
      input.surfaces[0],

    subtype:
      explicitSubtype ||
      null,

    domain:
      input.explicitDomain
        ?.trim()
        ? normalize(
            input.explicitDomain,
          )
        : null,

    capabilityHints:
      [],

    defaultRecipeId:
      null,

    confidence:
      explicitSubtype
        ? 0.7
        : 0.45,

    reasons: [
      'No curated subtype matched; preserving the resolved surface without coercing it into another product.',
    ],

    custom:
      true,
  };
}
