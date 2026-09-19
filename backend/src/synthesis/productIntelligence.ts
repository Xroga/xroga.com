import type {
  ProjectFile,
} from '../ai/patches.js';

import type {
  AcceptanceCriterion,
} from './acceptanceCompiler.js';

import type {
  ArchitecturePlan,
} from './architecturePlan.js';

import {
  selectBuildRecipe,
  type BuildRecipe,
} from './buildRecipes.js';

import {
  compileProductFilePlan,
  type ProductFilePlan,
} from './filePlan.js';

import {
  selectGoldenExamples,
  type GoldenExample,
} from './goldenExamples.js';

import {
  selectNichePack,
  type NichePack,
} from './nichePacks.js';

import {
  classifyProduct,
  type ProductClassification,
} from './productTaxonomy.js';

import type {
  ProductSurface,
} from './universalProductSpec.js';

export const PRODUCT_INTELLIGENCE_SCHEMA_VERSION =
  '1.0.0' as const;

export interface PreparedProductIntelligence {
  readonly classification:
    ProductClassification | null;

  readonly recipe:
    BuildRecipe | null;

  readonly nichePack:
    NichePack | null;

  readonly goldenExamples:
    readonly GoldenExample[];
}

export interface ProductIntelligencePlan
  extends PreparedProductIntelligence {
  readonly schemaVersion:
    typeof PRODUCT_INTELLIGENCE_SCHEMA_VERSION;

  readonly filePlan:
    ProductFilePlan;
}

export function prepareProductIntelligence(
  input: {
    text:
      string;

    surfaces:
      readonly ProductSurface[];

    explicitSubtype?:
      string | null;

    explicitDomain?:
      string | null;
  },
): PreparedProductIntelligence {
  const classification =
    classifyProduct({
      text:
        input.text,

      surfaces:
        input.surfaces,

      explicitSubtype:
        input.explicitSubtype,

      explicitDomain:
        input.explicitDomain,
    });

  const recipe =
    selectBuildRecipe({
      classification,

      surfaces:
        input.surfaces,
    });

  const nichePack =
    selectNichePack({
      text:
        input.text,

      classification,
    });

  const goldenExamples =
    selectGoldenExamples({
      classification,
      recipe,
      nichePack,
      limit:
        2,
    });

  return {
    classification,
    recipe,
    nichePack,
    goldenExamples,
  };
}

export function finalizeProductIntelligence(
  input: {
    prepared:
      PreparedProductIntelligence;

    architecture:
      ArchitecturePlan;

    existingFiles?:
      readonly ProjectFile[];
  },
): ProductIntelligencePlan {
  return {
    schemaVersion:
      PRODUCT_INTELLIGENCE_SCHEMA_VERSION,

    ...input.prepared,

    filePlan:
      compileProductFilePlan({
        architecture:
          input.architecture,

        recipe:
          input.prepared
            .recipe,

        nichePack:
          input.prepared
            .nichePack,

        existingFiles:
          input.existingFiles,
      }),
  };
}

function productIntelligenceCriteria(
  intelligence:
    ProductIntelligencePlan,
): AcceptanceCriterion[] {
  const criteria:
    AcceptanceCriterion[] =
    [];

  if (
    intelligence.recipe
  ) {
    for (
      const requirement of
      intelligence.recipe
        .verification
    ) {
      criteria.push({
        id:
          `recipe:${intelligence.recipe.id}:${requirement.id}`,

        statement:
          requirement.statement,

        surface:
          intelligence
            .classification
            ?.surface ??
          intelligence.recipe
            .surfaces[0] ??
          null,

        kind:
          requirement.kind,

        observable:
          requirement.observable,

        required:
          requirement.required,
      });
    }
  }

  const niche =
    intelligence.nichePack;

  if (
    niche &&
    (
      intelligence
        .classification
        ?.surface ===
        'web_frontend' ||
      intelligence
        .classification
        ?.surface ===
        'documentation_site'
    )
  ) {
    niche.contentRequirements
      .slice(
        0,
        6,
      )
      .forEach(
        (
          requirement,
          index,
        ) => {
          criteria.push({
            id:
              `niche:${niche.id}:${index}`,

            statement:
              requirement,

            surface:
              intelligence
                .classification
                ?.surface ??
              null,

            kind:
              'browser',

            observable:
              'the required content or interaction is visible in the rendered product',

            required:
              true,
          });
        },
      );
  }

  if (
    intelligence.filePlan
      .requiredPaths
      .length
  ) {
    criteria.push({
      id:
        'product-intelligence:file-plan',

      statement:
        'Required planned project files or equivalent repository roles exist',

      surface:
        intelligence
          .classification
          ?.surface ??
        null,

      kind:
        'build',

      observable:
        `the resulting workspace satisfies these required file roles: ${intelligence.filePlan.requiredPaths.join(', ')}`,

      required:
        true,
    });
  }

  return criteria;
}

export function mergeProductIntelligenceAcceptance(
  base:
    readonly AcceptanceCriterion[],

  intelligence:
    ProductIntelligencePlan,
): readonly AcceptanceCriterion[] {
  const combined = [
    ...base,
    ...productIntelligenceCriteria(
      intelligence,
    ),
  ];

  const seen =
    new Set<
      string
    >();

  return combined.filter(
    (
      criterion,
    ) => {
      const key =
        criterion.statement
          .trim()
          .toLowerCase();

      if (
        seen.has(
          key,
        )
      ) {
        return false;
      }

      seen.add(
        key,
      );

      return true;
    },
  );
}

export function productIntelligenceBrief(
  intelligence:
    ProductIntelligencePlan,
): string {
  const lines:
    string[] = [
    'Product intelligence — treat this as implementation guidance beneath repository facts and explicit architecture choices:',
  ];

  const classification =
    intelligence.classification;

  if (
    classification
  ) {
    lines.push(
      `  Product: ${classification.taxonomyId ?? 'custom'} / subtype=${classification.subtype ?? 'unknown'} / surface=${String(classification.surface)}` +
        (
          classification.domain
            ? ` / domain=${classification.domain}`
            : ''
        ),
    );
  }

  if (
    intelligence.recipe
  ) {
    lines.push(
      `  Build recipe: ${intelligence.recipe.id} — ${intelligence.recipe.label}`,
    );

    if (
      intelligence.recipe
        .capabilityRequirements
        .length
    ) {
      lines.push(
        `  Recipe capabilities: ${intelligence.recipe.capabilityRequirements.join(', ')}`,
      );
    }

    for (
      const constraint of
      intelligence.recipe
        .constraints
        .slice(
          0,
          8,
        )
    ) {
      lines.push(
        `  Recipe constraint: ${constraint}`,
      );
    }
  }

  if (
    intelligence.nichePack
  ) {
    lines.push(
      `  Niche pack: ${intelligence.nichePack.id}`,
    );

    for (
      const requirement of
      intelligence.nichePack
        .contentRequirements
        .slice(
          0,
          6,
        )
    ) {
      lines.push(
        `  Niche requirement: ${requirement}`,
      );
    }

    for (
      const rule of
      intelligence.nichePack
        .forbiddenAssumptions
        .slice(
          0,
          4,
        )
    ) {
      lines.push(
        `  Never assume: ${rule}`,
      );
    }
  }

  if (
    intelligence.filePlan
      .entries
      .length
  ) {
    lines.push(
      '  File plan:',
    );

    for (
      const entry of
      intelligence.filePlan
        .entries
        .slice(
          0,
          24,
        )
    ) {
      lines.push(
        `    - ${entry.role}: ${entry.path ?? '(follow existing repository conventions)'} — ${entry.description}`,
      );
    }
  }

  for (
    const example of
    intelligence.goldenExamples
      .slice(
        0,
        2,
      )
  ) {
    lines.push(
      `  Golden pattern: ${example.summary}`,
    );

    for (
      const lesson of
      example.lessons
        .slice(
          0,
          3,
        )
    ) {
      lines.push(
        `    - ${lesson}`,
      );
    }
  }

  return lines.join(
    '\n',
  );
}
