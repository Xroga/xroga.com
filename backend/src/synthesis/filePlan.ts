import type {
  ProjectFile,
} from '../ai/patches.js';

import type {
  ArchitecturePlan,
  PlannedComponent,
} from './architecturePlan.js';

import type {
  BuildRecipe,
  RecipeFileCandidate,
  RecipeFileRole,
} from './buildRecipes.js';

import type {
  NichePack,
} from './nichePacks.js';

export const PRODUCT_FILE_PLAN_SCHEMA_VERSION =
  '1.0.0' as const;

export type ProductFilePlanMode =
  | 'create'
  | 'update'
  | 'create_or_update'
  | 'satisfy_in_existing_repo';

export interface ProductFilePlanEntry {
  readonly role:
    string;

  readonly path:
    string | null;

  readonly componentId:
    string | null;

  readonly required:
    boolean;

  readonly mode:
    ProductFilePlanMode;

  readonly description:
    string;

  readonly source:
    'recipe'
    | 'architecture';
}

export interface ProductFilePlan {
  readonly schemaVersion:
    typeof PRODUCT_FILE_PLAN_SCHEMA_VERSION;

  readonly entries:
    readonly ProductFilePlanEntry[];

  readonly requiredPaths:
    readonly string[];

  readonly notes:
    readonly string[];
}

function joinRoot(
  root: string,
  path: string,
): string {
  const cleanRoot =
    root
      .replace(
        /^\/+|\/+$/g,
        '',
      );

  const cleanPath =
    path
      .replace(
        /^\/+/g,
        '',
      );

  return cleanRoot
    ? `${cleanRoot}/${cleanPath}`
    : cleanPath;
}

function candidateMatches(
  candidate:
    RecipeFileCandidate,

  component:
    PlannedComponent,
): boolean {
  if (
    candidate.framework !==
      undefined &&
    candidate.framework !==
      component.framework
  ) {
    return false;
  }

  if (
    candidate.language !==
      undefined &&
    candidate.language !==
      component.language
  ) {
    return false;
  }

  if (
    candidate.adapterId !==
      undefined &&
    candidate.adapterId !==
      component.adapterId
  ) {
    return false;
  }

  return true;
}

function candidateFor(
  role:
    RecipeFileRole,

  component:
    PlannedComponent,
): RecipeFileCandidate | null {
  return (
    role.candidates.find(
      (
        candidate,
      ) =>
        candidateMatches(
          candidate,
          component,
        ),
    ) ??
    null
  );
}

function genericEntries(
  component:
    PlannedComponent,
): ProductFilePlanEntry[] {
  const make = (
    role: string,
    path: string | null,
    description: string,
    required =
      true,
  ): ProductFilePlanEntry => ({
    role,

    path:
      path
        ? joinRoot(
            component.root,
            path,
          )
        : null,

    componentId:
      component.id,

    required,

    mode:
      'create_or_update',

    description,

    source:
      'architecture',
  });

  if (
    component.adapterId ===
    'static-web'
  ) {
    return [
      make(
        'entry',
        'index.html',
        'Primary static browser document.',
      ),

      make(
        'styles',
        'styles.css',
        'Static browser styles.',
      ),

      make(
        'browser_behavior',
        'script.js',
        'Browser behavior when interaction is required.',
        false,
      ),

      make(
        'readme',
        'README.md',
        'Project instructions.',
      ),
    ];
  }

  if (
    component.language ===
      'typescript' ||
    component.language ===
      'javascript'
  ) {
    if (
      component.framework ===
      'next'
    ) {
      return [
        make(
          'manifest',
          'package.json',
          'Node application manifest.',
        ),

        make(
          'entry',
          'app/page.tsx',
          'Primary Next.js page.',
        ),

        make(
          'styles',
          'app/globals.css',
          'Application styles.',
        ),

        make(
          'readme',
          'README.md',
          'Project instructions.',
        ),
      ];
    }

    return [
      make(
        'manifest',
        'package.json',
        'Node project manifest.',
      ),

      make(
        'entry',
        'src/index.ts',
        'Primary source entry.',
      ),

      make(
        'tests',
        'tests/index.test.ts',
        'Representative tests.',
        false,
      ),

      make(
        'readme',
        'README.md',
        'Project instructions.',
      ),
    ];
  }

  if (
    component.language ===
    'python'
  ) {
    return [
      make(
        'manifest',
        'pyproject.toml',
        'Python project manifest.',
      ),

      make(
        'entry',
        'app/main.py',
        'Primary Python entry.',
      ),

      make(
        'tests',
        'tests/test_main.py',
        'Representative tests.',
      ),

      make(
        'readme',
        'README.md',
        'Project instructions.',
      ),
    ];
  }

  if (
    component.language ===
    'rust'
  ) {
    const library =
      component.surfaces.some(
        (
          surface,
        ) =>
          String(
            surface,
          ) ===
            'library' ||
          String(
            surface,
          ) ===
            'sdk',
      );

    return [
      make(
        'manifest',
        'Cargo.toml',
        'Rust package manifest.',
      ),

      make(
        'entry',
        library
          ? 'src/lib.rs'
          : 'src/main.rs',
        'Primary Rust source entry.',
      ),

      make(
        'tests',
        'tests/integration.rs',
        'Representative integration tests.',
      ),

      make(
        'readme',
        'README.md',
        'Project instructions.',
      ),
    ];
  }

  if (
    component.language ===
    'dart'
  ) {
    return [
      make(
        'manifest',
        'pubspec.yaml',
        'Dart/Flutter package manifest.',
      ),

      make(
        'entry',
        'lib/main.dart',
        'Application entry.',
      ),

      make(
        'tests',
        'test/widget_test.dart',
        'Representative Flutter test.',
      ),

      make(
        'readme',
        'README.md',
        'Project instructions.',
      ),
    ];
  }

  return [
    make(
      'primary_source',
      null,
      `Implement the primary ${component.language ?? 'unknown'} source using the selected architecture.`,
    ),

    make(
      'readme',
      'README.md',
      'Project usage and validation instructions.',
    ),
  ];
}

export function compileProductFilePlan(
  input: {
    architecture:
      ArchitecturePlan;

    recipe:
      BuildRecipe | null;

    nichePack:
      NichePack | null;

    existingFiles?:
      readonly ProjectFile[];
  },
): ProductFilePlan {
  const existing =
    new Set(
      (
        input.existingFiles ??
        []
      ).map(
        (
          file,
        ) =>
          file.path,
      ),
    );

  const entries:
    ProductFilePlanEntry[] =
    [];

  for (
    const component of
    input.architecture
      .components
  ) {
    const before =
      entries.length;

    if (
      input.recipe
    ) {
      for (
        const role of
        input.recipe.files
      ) {
        const candidate =
          candidateFor(
            role,
            component,
          );

        /*
         * Candidate-bound roles do not apply to architectures they were
         * not designed for.
         */
        if (
          role.candidates.length >
            0 &&
          !candidate
        ) {
          continue;
        }

        const candidatePath =
          candidate
            ? joinRoot(
                component.root,
                candidate.path,
              )
            : null;

        const inherited =
          input.architecture
            .inheritedFromRepository;

        const path =
          inherited &&
          candidatePath &&
          !existing.has(
            candidatePath,
          )
            ? null
            : candidatePath;

        entries.push({
          role:
            role.id,

          path,

          componentId:
            component.id,

          required:
            role.required,

          mode:
            inherited
              ? path
                ? 'update'
                : 'satisfy_in_existing_repo'
              : candidatePath &&
                  existing.has(
                    candidatePath,
                  )
                ? 'update'
                : candidatePath
                  ? 'create'
                  : 'create_or_update',

          description:
            inherited &&
            !path
              ? `${role.description} Satisfy this role using the repository's existing conventions rather than forcing the recipe's greenfield path.`
              : role.description,

          source:
            'recipe',
        });
      }
    }

    if (
      entries.length ===
      before
    ) {
      entries.push(
        ...genericEntries(
          component,
        ).map(
          (
            entry,
          ) => ({
            ...entry,

            mode:
              input.architecture
                .inheritedFromRepository
                ? 'satisfy_in_existing_repo' as const
                : entry.mode,
          }),
        ),
      );
    }
  }

  const unique =
    new Map<
      string,
      ProductFilePlanEntry
    >();

  for (
    const entry of
    entries
  ) {
    const key =
      `${entry.componentId ?? 'root'}:${entry.path ?? entry.role}`;

    if (
      !unique.has(
        key,
      )
    ) {
      unique.set(
        key,
        entry,
      );
    }
  }

  const finalEntries =
    [...unique.values()];

  const notes:
    string[] = [];

  if (
    input.architecture
      .inheritedFromRepository
  ) {
    notes.push(
      'Existing repository structure is authoritative. Recipe file paths are advisory; satisfy roles using existing conventions.',
    );
  }

  if (
    input.nichePack
  ) {
    notes.push(
      `Apply ${input.nichePack.id} niche requirements without fabricating unsupported facts.`,
    );
  }

  if (
    !input.recipe
  ) {
    notes.push(
      'No curated recipe matched. File roles were derived from the selected architecture instead of coercing the product into another recipe.',
    );
  }

  return {
    schemaVersion:
      PRODUCT_FILE_PLAN_SCHEMA_VERSION,

    entries:
      finalEntries,

    requiredPaths:
      finalEntries
        .filter(
          (
            entry,
          ) =>
            entry.required &&
            Boolean(
              entry.path,
            ),
        )
        .map(
          (
            entry,
          ) =>
            entry.path!,
        ),

    notes,
  };
}
