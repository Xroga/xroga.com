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

import type { ProjectFile } from '../ai/patches.js';
import type { ProductSurface, UniversalProductSpec } from './universalProductSpec.js';
import { detectComposition, type RepositoryComposition } from './runtime/registry.js';
import { discoverRepository } from './runtime/repositoryDiscovery.js';

export const ARCHITECTURE_PLAN_SCHEMA_VERSION = '1.0.0' as const;

/**
 * One choice, with everything needed to review it.
 *
 * §6 lists these fields; the ones that earn their place are `alternativesConsidered` and
 * `inheritedFromRepository`. The first makes a decision arguable — a reviewer can see what
 * lost and why. The second is the difference between "we picked Django" and "this is
 * already Django", which is the whole of §26.
 */
export interface ArchitectureDecision {
  readonly id: string;
  readonly category: 'language' | 'runtime' | 'framework' | 'package_manager' | 'build_system' | 'database' | 'deployment' | 'packaging';
  readonly selection: string;
  readonly reason: string;
  readonly requirementEvidence: readonly string[];
  readonly repositoryEvidence: readonly string[];
  readonly alternativesConsidered: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly confidence: number;
  /** True when the repository already made this choice and it is being respected. */
  readonly inheritedFromRepository: boolean;
  readonly authorizationRequired: boolean;
  readonly validationMethod: string;
}

export interface PlannedComponent {
  readonly id: string;
  readonly root: string;
  readonly surfaces: readonly ProductSurface[];
  readonly language: string | null;
  readonly runtime: string | null;
  readonly framework: string | null;
  readonly packageManager: string | null;
  readonly buildSystem: string | null;
  readonly adapterId: string | null;
  /** Set when no adapter can build this component. */
  readonly blocker: string | null;
}

export interface ArchitecturePlan {
  readonly schemaVersion: string;
  readonly components: readonly PlannedComponent[];
  readonly decisions: readonly ArchitectureDecision[];
  readonly blockers: readonly string[];
  readonly unresolvedQuestions: readonly string[];
  /** True when an existing repository determined the stack. */
  readonly inheritedFromRepository: boolean;
  readonly createdAt: string;
}

/**
 * Default language per surface, used only for greenfield work.
 *
 * These are starting points, not rules — every one is overridden by an explicit request
 * and by any existing repository. They exist because a greenfield CLI has to be written in
 * *something*, and refusing to choose would be unhelpful where the choice is reversible.
 *
 * §6 forbids forcing Next.js, React, Node or Postgres where the product does not need
 * them, and the table respects that: a CLI defaults to Rust, a data pipeline to Python, a
 * worker to Python. Only surfaces that genuinely run in a browser get JavaScript.
 */
const SURFACE_DEFAULTS: Readonly<Record<string, { language: string; runtime: string; framework: string | null; reason: string }>> = {
  cli: { language: 'rust', runtime: 'native', framework: null, reason: 'a CLI benefits from a single self-contained binary with no runtime to install' },
  api: { language: 'python', runtime: 'cpython', framework: 'fastapi', reason: 'FastAPI gives schema validation and generated API documentation without extra work' },
  worker: { language: 'python', runtime: 'cpython', framework: null, reason: 'background processing needs no HTTP framework' },
  scheduled_job: { language: 'python', runtime: 'cpython', framework: null, reason: 'a scheduled task is a plain program invoked by a scheduler' },
  data_pipeline: { language: 'python', runtime: 'cpython', framework: null, reason: 'the data ecosystem is strongest in Python' },
  etl: { language: 'python', runtime: 'cpython', framework: null, reason: 'the data ecosystem is strongest in Python' },
  ai_pipeline: { language: 'python', runtime: 'cpython', framework: null, reason: 'model tooling is Python-first' },
  web_frontend: { language: 'typescript', runtime: 'node', framework: 'next', reason: 'a browser interface runs JavaScript by definition; Next.js covers routing and rendering' },
  browser_extension: { language: 'typescript', runtime: 'browser', framework: null, reason: 'extension APIs are JavaScript and the manifest defines the structure' },
  mobile_app: { language: 'dart', runtime: 'flutter', framework: 'flutter', reason: 'one codebase covering both mobile platforms' },
  desktop_app: { language: 'rust', runtime: 'tauri', framework: 'tauri', reason: 'a native binary with a web view, far smaller than bundling a browser' },
  library: { language: 'typescript', runtime: 'node', framework: null, reason: 'no stronger signal is present; overridden by any stated language' },
  smart_contract: { language: 'solidity', runtime: 'evm', framework: 'foundry', reason: 'Foundry tests contracts in Solidity itself' },
  infrastructure_module: { language: 'hcl', runtime: 'terraform', framework: null, reason: 'the request describes declarative infrastructure' },
  mcp_server: { language: 'typescript', runtime: 'node', framework: null, reason: 'the reference MCP SDK is TypeScript' },
  game: { language: 'typescript', runtime: 'node', framework: null, reason: 'no stronger signal is present; overridden by any stated engine' },
};

/** Languages a user can name outright, which always beats a default. */
const EXPLICIT_LANGUAGES: ReadonlyArray<[RegExp, string, string]> = [
  [/\brust\b/i, 'rust', 'native'],
  [/\bpython\b/i, 'python', 'cpython'],
  [/\b(typescript|node(?:\.js)?)\b/i, 'typescript', 'node'],
  [/\bjavascript\b/i, 'javascript', 'node'],
  [/\bgo(?:lang)?\b/i, 'go', 'go'],
  [/\bjava\b/i, 'java', 'jvm'],
  [/\bkotlin\b/i, 'kotlin', 'jvm'],
  [/\b(c#|csharp|\.net|dotnet)\b/i, 'csharp', 'dotnet'],
  [/\bphp\b/i, 'php', 'php'],
  [/\bruby\b/i, 'ruby', 'ruby'],
  [/\b(dart|flutter)\b/i, 'dart', 'flutter'],
  [/\bswift\b/i, 'swift', 'native'],
  [/\belixir\b/i, 'elixir', 'beam'],
  [/\bzig\b/i, 'zig', 'native'],
  [/\bscala\b/i, 'scala', 'jvm'],
  [/\bsolidity\b/i, 'solidity', 'evm'],
  [/\bc\+\+\b/i, 'cpp', 'native'],
];

/** Frameworks a user can name outright. */
const EXPLICIT_FRAMEWORKS: ReadonlyArray<[RegExp, string, string]> = [
  [/\bfastapi\b/i, 'fastapi', 'python'],
  [/\bdjango\b/i, 'django', 'python'],
  [/\bflask\b/i, 'flask', 'python'],
  [/\bnext\.?js\b/i, 'next', 'typescript'],
  [/\breact\b/i, 'react', 'typescript'],
  [/\bvue\b/i, 'vue', 'typescript'],
  [/\bsvelte(?:kit)?\b/i, 'svelte', 'typescript'],
  [/\bexpress\b/i, 'express', 'typescript'],
  [/\bfastify\b/i, 'fastify', 'typescript'],
  [/\bspring(?: boot)?\b/i, 'spring-boot', 'java'],
  [/\blaravel\b/i, 'laravel', 'php'],
  [/\brails\b/i, 'rails', 'ruby'],
  [/\bgin\b/i, 'gin', 'go'],
  [/\baxum\b/i, 'axum', 'rust'],
  [/\bactix\b/i, 'actix', 'rust'],
  [/\bphoenix\b/i, 'phoenix', 'elixir'],
  [/\bflutter\b/i, 'flutter', 'dart'],
  [/\bfoundry\b/i, 'foundry', 'solidity'],
  [/\bhardhat\b/i, 'hardhat', 'typescript'],
];

const DATABASES: ReadonlyArray<[RegExp, string]> = [
  [/\bpostgres(?:ql)?\b/i, 'postgresql'],
  [/\bmysql\b/i, 'mysql'],
  [/\bsqlite\b/i, 'sqlite'],
  [/\bmongo(?:db)?\b/i, 'mongodb'],
  [/\bredis\b/i, 'redis'],
  [/\bdynamodb\b/i, 'dynamodb'],
  [/\bsupabase\b/i, 'supabase'],
];

function explicitLanguage(prompt: string): { language: string; runtime: string; matched: string } | null {
  for (const [pattern, language, runtime] of EXPLICIT_LANGUAGES) {
    const match = prompt.match(pattern);
    if (match) return { language, runtime, matched: match[0] };
  }
  return null;
}

function explicitFramework(prompt: string): { framework: string; language: string; matched: string } | null {
  for (const [pattern, framework, language] of EXPLICIT_FRAMEWORKS) {
    const match = prompt.match(pattern);
    if (match) return { framework, language, matched: match[0] };
  }
  return null;
}

/**
 * Builds a plan for an existing repository.
 *
 * The rule from §26 is that an existing repository is normally extended, not replaced, and
 * this is where that holds or fails. Every component's language comes from what is
 * actually committed, and each decision is marked `inheritedFromRepository` so a reviewer
 * can see nothing was chosen at all. A Django repository stays Django even if the request
 * mentions Node — and if the user really wants a migration, §27 makes that an explicit
 * transformation rather than something that happens by accident because a prompt used a
 * word.
 */
function planFromRepository(
  spec: UniversalProductSpec,
  composition: RepositoryComposition,
  files: readonly ProjectFile[],
  discovery = discoverRepository(files),
): ArchitecturePlan {
  const components: PlannedComponent[] = [];
  const decisions: ArchitectureDecision[] = [];
  const blockers: string[] = [];

  for (const component of composition.components) {
    const { inspection } = component;
    const language = inspection.languages[0] ?? null;
    components.push({
      id: `component:${component.root || 'root'}`,
      root: component.root,
      surfaces: spec.surfaces.map((declaration) => declaration.surface),
      language,
      runtime: component.adapterId,
      framework: null,
      packageManager: inspection.packageManager,
      buildSystem: inspection.buildSystem,
      adapterId: component.adapterId,
      blocker: null,
    });
    decisions.push({
      id: `language:${component.root || 'root'}`,
      category: 'language',
      selection: language ?? 'unknown',
      reason: 'the repository already uses this language; extending it is cheaper and safer than migrating',
      requirementEvidence: [],
      repositoryEvidence: [...inspection.evidence],
      alternativesConsidered: ['migrate to another language'],
      tradeoffs: ['a migration would need behavioural characterisation tests first (§27)'],
      confidence: 1,
      inheritedFromRepository: true,
      authorizationRequired: false,
      validationMethod: `run the ${component.adapterId} adapter's test command`,
    });
  }

  // Recognised but unbuildable is the specific blocker that stops a Gradle service being
  // regenerated as something else.
  for (const signal of discovery.unsupported) {
    const blocker = `${signal.displayName} at ${signal.root || '.'} is recognised (${signal.markers.join(', ')}) but no runtime adapter can build it. Nothing was executed for this component.`;
    blockers.push(blocker);
    components.push({
      id: `component:${signal.root || 'root'}:${signal.ecosystem}`,
      root: signal.root,
      surfaces: [],
      language: signal.ecosystem,
      runtime: null,
      framework: null,
      packageManager: signal.packageManager,
      buildSystem: signal.buildSystem,
      adapterId: null,
      blocker,
    });
  }

  // A tree that matched no marker at all — a Nim or Haskell repository, say. There is
  // nothing to name and still something to build, so the component is recorded with the
  // languages inference could see and left for §12 discovery to resolve. Returning no
  // component here would make an existing repository indistinguishable from an empty one.
  if (!components.length) {
    const languages = [
      ...new Set(
        discovery.generic
          .filter((signal) => signal.kind === 'extension')
          .map((signal) => signal.detail.replace(/^\d+\s+/, '').replace(/\s+source file\(s\)$/, '')),
      ),
    ];
    const blocker =
      `The repository uses a toolchain no runtime adapter recognises` +
      (languages.length ? ` (${languages.join(', ')} sources found)` : '') +
      '. Build and test commands must be discovered from repository evidence before anything can run.';
    blockers.push(blocker);
    components.push({
      id: 'component:root',
      root: '',
      surfaces: spec.surfaces.map((declaration) => declaration.surface),
      language: languages[0] ?? null,
      runtime: null,
      framework: null,
      packageManager: null,
      buildSystem: null,
      adapterId: null,
      blocker,
    });
  }

  return {
    schemaVersion: ARCHITECTURE_PLAN_SCHEMA_VERSION,
    components,
    decisions,
    blockers,
    unresolvedQuestions: [],
    inheritedFromRepository: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Plans an architecture from a spec and, when present, a repository.
 *
 * Precedence, highest first: an existing repository, then a language the user named, then
 * the surface default. Anything below the first is a preference; the first is a fact.
 */
export function planArchitecture(input: {
  spec: UniversalProductSpec;
  files?: readonly ProjectFile[];
}): ArchitecturePlan {
  const files = input.files ?? [];
  const spec = input.spec;
  const prompt = spec.sourcePrompt ?? '';

  if (files.length) {
    const composition = detectComposition(files);
    const discovery = discoverRepository(files);
    // `needsRuntimeDiscovery` belongs in this condition, not just the first two. A Nim
    // repository matches no marker and has no adapter, so without it the request fell
    // through to the greenfield path — where a maintenance prompt like "fix the delimiter
    // bug" names no surface and was refused as if the repository were not there at all.
    // An existing tree is a fact regardless of whether anything can build it.
    if (composition.components.length || discovery.unsupported.length || discovery.needsRuntimeDiscovery) {
      return planFromRepository(spec, composition, files, discovery);
    }
  }

  // No surfaces means the request was not understood. Producing a plan anyway is exactly
  // the failure being removed: the old code turned "I do not know" into a static website.
  if (!spec.surfaces.length) {
    return {
      schemaVersion: ARCHITECTURE_PLAN_SCHEMA_VERSION,
      components: [],
      decisions: [],
      blockers: [
        'No product surface could be determined, so no architecture was selected. ' +
          'Nothing was generated. This is deliberate: defaulting to a static website here is what made ' +
          'unfamiliar requests silently produce the wrong artefact.',
      ],
      unresolvedQuestions: [...spec.unresolvedQuestions],
      inheritedFromRepository: false,
      createdAt: new Date().toISOString(),
    };
  }

  const decisions: ArchitectureDecision[] = [];
  const components: PlannedComponent[] = [];
  const blockers: string[] = [];

  const stated = explicitLanguage(prompt);
  const statedFramework = explicitFramework(prompt);

  for (const declaration of spec.surfaces) {
    const surface = declaration.surface as string;
    const fallback = SURFACE_DEFAULTS[surface];

    // A named language wins over the surface default, but only where it is coherent: a
    // browser interface cannot be written in Rust, so "a Rust web app" keeps TypeScript
    // for the frontend surface and Rust for everything else rather than silently
    // producing something that cannot run.
    const browserBound = surface === 'web_frontend' || surface === 'browser_extension';
    const useStated = stated && !browserBound;

    const language = useStated ? stated.language : fallback?.language ?? null;
    const runtime = useStated ? stated.runtime : fallback?.runtime ?? null;

    let framework: string | null = fallback?.framework ?? null;
    if (statedFramework && (!language || statedFramework.language === language)) {
      framework = statedFramework.framework;
    }

    if (!language) {
      const blocker = `Surface "${surface}" has no default language and none was stated, so no stack was selected for it. Nothing was generated for this surface.`;
      blockers.push(blocker);
      components.push({
        id: `component:${surface}`, root: surface, surfaces: [declaration.surface],
        language: null, runtime: null, framework: null, packageManager: null,
        buildSystem: null, adapterId: null, blocker,
      });
      continue;
    }

    const adapterId = language === 'rust' ? 'rust' : language === 'python' ? 'python'
      : language === 'typescript' || language === 'javascript' ? 'node' : null;

    const componentBlocker = adapterId
      ? null
      : `No runtime adapter implements ${language}, so this component can be planned but not built or validated.`;
    if (componentBlocker) blockers.push(`${surface}: ${componentBlocker}`);

    components.push({
      id: `component:${surface}`,
      // Single-surface products live at the root; multi-surface products get a directory
      // each, which is what keeps a service and its worker separable later.
      root: spec.surfaces.length === 1 ? '' : surface,
      surfaces: [declaration.surface],
      language,
      runtime,
      framework,
      packageManager: adapterId === 'rust' ? 'cargo' : adapterId === 'python' ? 'pip' : adapterId === 'node' ? 'npm' : null,
      buildSystem: adapterId === 'rust' ? 'cargo' : null,
      adapterId,
      blocker: componentBlocker,
    });

    decisions.push({
      id: `language:${surface}`,
      category: 'language',
      selection: language,
      reason: useStated
        ? `the request names ${stated!.matched} explicitly`
        : browserBound && stated
          ? `${stated.language} cannot run in a browser, so this surface keeps ${language} while other surfaces use the stated language`
          : fallback?.reason ?? 'no stronger signal was available',
      requirementEvidence: [`surface ${surface}: ${declaration.reason}`, ...declaration.evidence],
      repositoryEvidence: [],
      alternativesConsidered: Object.entries(SURFACE_DEFAULTS)
        .filter(([key, value]) => key === surface && value.language !== language)
        .map(([, value]) => value.language),
      tradeoffs: useStated ? [] : ['a stated preference would override this default'],
      confidence: useStated ? 0.95 : declaration.confidence,
      inheritedFromRepository: false,
      authorizationRequired: false,
      validationMethod: adapterId ? `run the ${adapterId} adapter's test command` : 'no adapter available; cannot validate',
    });

    if (framework) {
      decisions.push({
        id: `framework:${surface}`,
        category: 'framework',
        selection: framework,
        reason: statedFramework?.framework === framework
          ? `the request names ${statedFramework.matched} explicitly`
          : fallback?.reason ?? 'the surface default',
        requirementEvidence: [`surface ${surface}`],
        repositoryEvidence: [],
        alternativesConsidered: [],
        tradeoffs: [],
        confidence: statedFramework?.framework === framework ? 0.95 : 0.6,
        inheritedFromRepository: false,
        authorizationRequired: false,
        validationMethod: 'the framework must appear in the dependency manifest',
      });
    }
  }

  // A database is added only when the request asks for persistence. §6 forbids assuming
  // one, and most of these surfaces genuinely need none.
  const namedDatabase = DATABASES.find(([pattern]) => pattern.test(prompt));
  if (namedDatabase) {
    decisions.push({
      id: 'database', category: 'database', selection: namedDatabase[1],
      reason: 'the request names this datastore',
      requirementEvidence: [`request mentions ${namedDatabase[1]}`],
      repositoryEvidence: [], alternativesConsidered: [], tradeoffs: [],
      confidence: 0.95, inheritedFromRepository: false, authorizationRequired: false,
      validationMethod: 'a migration or schema file must exist and apply',
    });
  } else if (spec.storageRequirements.length) {
    decisions.push({
      id: 'database', category: 'database', selection: 'sqlite',
      reason: 'persistence is required but no datastore was named; SQLite needs no server and no credentials to validate',
      requirementEvidence: spec.storageRequirements,
      repositoryEvidence: [],
      alternativesConsidered: ['postgresql', 'mysql', 'mongodb'],
      tradeoffs: ['SQLite does not cover multi-writer production load; migrating later is a schema change, not a rewrite'],
      confidence: 0.6, inheritedFromRepository: false, authorizationRequired: false,
      validationMethod: 'a migration or schema file must exist and apply',
    });
  }

  return {
    schemaVersion: ARCHITECTURE_PLAN_SCHEMA_VERSION,
    components,
    decisions,
    blockers,
    unresolvedQuestions: [...spec.unresolvedQuestions],
    inheritedFromRepository: false,
    createdAt: new Date().toISOString(),
  };
}

/** True when the plan chose nothing and said so, rather than choosing badly. */
export function planIsRefusal(plan: ArchitecturePlan): boolean {
  return plan.components.length === 0 && plan.blockers.length > 0;
}
