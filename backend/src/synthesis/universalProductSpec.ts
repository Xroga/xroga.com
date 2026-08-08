/**
 * What the user wants, described so that it can be built rather than categorised.
 *
 * The mechanism this replaces is `detectScaffoldKind`: a regex ladder over five values
 * that returns `'static'` when nothing matches. Two properties of that shape cause the
 * damage, and both are fixed here.
 *
 * It returns **one** answer. A product that is an API *and* a worker *and* a CLI has to
 * lose two of those, so the surfaces that lost simply never get built. Here a spec carries
 * a list, because "a Go service with a background cleanup worker" (§58 D) is two surfaces
 * and describing it as one is already wrong.
 *
 * And its answer set is **closed**, so an unrecognised request cannot be represented — it
 * can only be misrepresented, and `'static'` is the default misrepresentation. Here
 * `ProductSurface` is `KnownProductSurface | (string & {})`: the known values still
 * autocomplete and still typecheck, and a surface nobody anticipated is a legal value
 * rather than a parse failure. §58 N asks for exactly this, a product category absent from
 * every existing list that still yields a real spec.
 *
 * The other rule is that inference reads **behaviour, not category keywords**. "Converts
 * CSV files to JSON" describes a batch transformation with file inputs and no session,
 * which is a CLI whether or not the word appears. Keyword matching would find nothing in
 * that sentence and fall back to a website.
 *
 * What this module does not do is decide a stack. Surfaces are what the product must
 * *do*; languages, frameworks and runtimes are `architecturePlan.ts`, and keeping them
 * apart is what allows a CLI to be Rust in one request and Python in another without the
 * surface changing meaning.
 */

import type { ProjectFile } from '../ai/patches.js';
import { detectComposition } from './runtime/registry.js';

export const UNIVERSAL_PRODUCT_SPEC_SCHEMA_VERSION = '1.0.0' as const;

/**
 * Surfaces seen often enough to name.
 *
 * A list for recognition, never a constraint — see `ProductSurface`. Everything here comes
 * from §5's examples.
 */
export const KNOWN_PRODUCT_SURFACES = [
  'web_frontend', 'api', 'worker', 'scheduled_job', 'cli', 'library', 'sdk',
  'mobile_app', 'desktop_app', 'browser_extension', 'cms_plugin', 'game',
  'smart_contract', 'blockchain_program', 'indexer', 'data_pipeline', 'etl',
  'stream_processor', 'ai_pipeline', 'mcp_server', 'webhook_service',
  'infrastructure_module', 'embedded_app', 'documentation_site', 'database_package',
  'devtool', 'plugin', 'package', 'daemon', 'background_service',
] as const;

export type KnownProductSurface = (typeof KNOWN_PRODUCT_SURFACES)[number];

/**
 * A product surface.
 *
 * `(string & {})` is deliberate. It keeps editor completion for the known values while
 * accepting any string, so a request for something genuinely new is representable instead
 * of being coerced into the nearest known category. A plain `string` would lose the
 * completions; a bare union would reject the new value — this keeps both.
 */
export type ProductSurface = KnownProductSurface | (string & {});

export interface SurfaceDeclaration {
  readonly surface: ProductSurface;
  /** Why this surface is present, in terms of what the product must do. */
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
  /** True when the surface is not in `KNOWN_PRODUCT_SURFACES`. */
  readonly custom: boolean;
}

export interface UniversalProductSpec {
  readonly schemaVersion: string;
  readonly projectId: string | null;
  readonly runId: string | null;
  readonly title: string;
  readonly objective: string;
  readonly requestedOutcome: string;
  readonly surfaces: readonly SurfaceDeclaration[];
  readonly functionalRequirements: readonly string[];
  readonly nonFunctionalRequirements: readonly string[];
  readonly storageRequirements: readonly string[];
  readonly integrationRequirements: readonly string[];
  readonly packagingRequirements: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly assumptions: readonly string[];
  readonly inferredRequirements: readonly string[];
  readonly unresolvedQuestions: readonly string[];
  readonly blockers: readonly string[];
  /** Repository facts that constrained the spec, empty for greenfield. */
  readonly repositoryEvidence: readonly string[];
  readonly sourcePrompt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A behavioural signal, scored per surface.
 *
 * Scores rather than booleans because surfaces overlap: "dashboard" implies a frontend
 * strongly and an API weakly, and both should appear with the difference visible. A single
 * winner-takes-all match is what produces one answer where several are true.
 */
interface SurfaceRule {
  readonly surface: ProductSurface;
  readonly pattern: RegExp;
  readonly weight: number;
  readonly reason: string;
}

/**
 * Behavioural rules.
 *
 * Phrased around what the thing does. `cli` matches "command line" but also "converts …
 * files", because a batch file transformation with no session is a CLI regardless of
 * vocabulary. That is the property `detectScaffoldKind` lacks and the reason a Rust CSV
 * converter became a website.
 */
const RULES: readonly SurfaceRule[] = [
  // Command-line and developer tooling.
  { surface: 'cli', pattern: /\b(cli|command[- ]line|terminal (?:app|tool|program)|tui)\b/i, weight: 10, reason: 'the request names a command-line interface' },
  { surface: 'cli', pattern: /\bconverts?\b[\s\S]{0,40}\b(files?|csv|json|xml|yaml|images?|documents?)\b/i, weight: 7, reason: 'a batch file transformation with no interactive session is a command-line tool' },
  { surface: 'cli', pattern: /\b(stdin|stdout|exit codes?|arguments?|flags?)\b/i, weight: 5, reason: 'the request describes process-level input, output or exit behaviour' },
  { surface: 'devtool', pattern: /\b(developer tool|dev tool|linter|formatter|code ?gen|scaffold(?:er|ing)? tool)\b/i, weight: 8, reason: 'the product targets developers as its users' },

  // Services.
  { surface: 'api', pattern: /\b(api|rest|graphql|grpc|endpoints?|backend service|microservice)\b/i, weight: 9, reason: 'the request names a programmatic interface over a network' },
  { surface: 'api', pattern: /\b(crud|create,? read,? update)\b/i, weight: 6, reason: 'CRUD over persisted entities implies a service interface' },
  // "service" on its own is broad, so it scores low — enough to surface alongside a
  // stronger signal ("a Go HTTP service with a background worker" is both), not enough to
  // win on its own against anything more specific.
  { surface: 'api', pattern: /\b(?:http |web |backend )?service\b/i, weight: 5, reason: 'a service accepts requests from callers over a network' },
  { surface: 'webhook_service', pattern: /\bwebhooks?\b/i, weight: 7, reason: 'inbound webhook delivery must be received and verified' },
  { surface: 'mcp_server', pattern: /\bmcp (?:server|tool)\b/i, weight: 10, reason: 'the request names the Model Context Protocol' },

  // Background execution.
  { surface: 'worker', pattern: /\b(worker|queue|background (?:job|task|process|cleanup)|consumer)\b/i, weight: 8, reason: 'work happens outside a request/response cycle' },
  { surface: 'scheduled_job', pattern: /\b(cron|scheduled?|periodic(?:ally)?|every (?:hour|day|night|minute))\b/i, weight: 8, reason: 'work is triggered by time rather than by a caller' },
  { surface: 'daemon', pattern: /\b(daemon|long[- ]running (?:process|service)|service that runs)\b/i, weight: 7, reason: 'a persistent process rather than a one-shot invocation' },

  // Data.
  { surface: 'etl', pattern: /\b(etl|extract,? transform|data (?:pipeline|ingestion)|ingest)\b/i, weight: 9, reason: 'data moves between systems and is reshaped in transit' },
  { surface: 'data_pipeline', pattern: /\b(pipeline|batch (?:processing|job)|data processing)\b/i, weight: 6, reason: 'staged processing of data sets' },
  { surface: 'stream_processor', pattern: /\b(stream(?:ing)? (?:processor|processing)|kafka|event stream|real[- ]?time (?:events|feed))\b/i, weight: 8, reason: 'unbounded event input rather than finite batches' },
  { surface: 'indexer', pattern: /\bindexer?\b/i, weight: 7, reason: 'external state is followed and indexed for query' },

  // Interfaces.
  { surface: 'web_frontend', pattern: /\b(website|web ?site|web ?app|landing page|dashboard|portfolio|blog|storefront|web ?page)\b/i, weight: 9, reason: 'the request names a browser-rendered interface' },
  { surface: 'web_frontend', pattern: /\b(react|next\.?js|vue|svelte|angular|tailwind)\b/i, weight: 7, reason: 'the request names a browser UI framework' },
  { surface: 'mobile_app', pattern: /\b(mobile app|ios|android|flutter|react native|expo|smartphone)\b/i, weight: 10, reason: 'the request targets a mobile device platform' },
  { surface: 'desktop_app', pattern: /\b(desktop (?:app|application)|electron|tauri|windows app|mac(?:os)? app)\b/i, weight: 10, reason: 'the request targets a desktop operating system' },
  { surface: 'browser_extension', pattern: /\b(browser extension|chrome extension|firefox add[- ]?on|web ?extension)\b/i, weight: 10, reason: 'the request targets a browser extension runtime' },
  { surface: 'game', pattern: /\b(game|multiplayer|gameplay|godot|unity)\b/i, weight: 8, reason: 'interactive real-time simulation' },

  // Distributables.
  { surface: 'library', pattern: /\b(library|crate|module for|reusable (?:component|code))\b/i, weight: 8, reason: 'the product is consumed by other code rather than run directly' },
  { surface: 'sdk', pattern: /\bsdk\b/i, weight: 9, reason: 'a client surface for an external service' },
  { surface: 'package', pattern: /\b(npm package|python package|gem|nuget package|publish(?:ed)? to)\b/i, weight: 8, reason: 'the product is distributed through a package registry' },
  { surface: 'cms_plugin', pattern: /\b(wordpress|woocommerce|drupal|shopify app)\b/i, weight: 10, reason: 'the product extends a host CMS platform' },
  { surface: 'plugin', pattern: /\b(plugin|add[- ]?on|extension for)\b/i, weight: 6, reason: 'the product extends a host application' },

  // Chain.
  { surface: 'smart_contract', pattern: /\b(smart ?contract|solidity|erc[- ]?\d+|on[- ]chain)\b/i, weight: 10, reason: 'logic executes on a blockchain' },
  { surface: 'blockchain_program', pattern: /\b(solana program|anchor|move module)\b/i, weight: 10, reason: 'a non-EVM chain program' },

  // Infrastructure and docs.
  { surface: 'infrastructure_module', pattern: /\b(terraform|pulumi|kubernetes|helm chart|infrastructure(?: as code)?)\b/i, weight: 9, reason: 'the product declares infrastructure rather than application behaviour' },
  { surface: 'documentation_site', pattern: /\b(documentation site|docs site|knowledge base)\b/i, weight: 8, reason: 'the product publishes structured documentation' },

  // AI.
  { surface: 'ai_pipeline', pattern: /\b(machine learning|ml (?:model|inference)|rag\b|embeddings?|llm|inference (?:api|service))\b/i, weight: 8, reason: 'model inference is part of the product behaviour' },
];

/** Surfaces implied by another surface rather than stated. */
const IMPLIED: ReadonlyArray<{ when: ProductSurface; add: ProductSurface; reason: string }> = [
  { when: 'smart_contract', add: 'web_frontend', reason: 'a contract needs a client to be usable by a person' },
  { when: 'mcp_server', add: 'api', reason: 'an MCP server exposes a protocol surface over a transport' },
];

const STORAGE_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\b(database|persist|store|save|records?)\b/i, 'persistent storage for domain entities'],
  [/\b(postgres(?:ql)?|mysql|sqlite|mongo(?:db)?|redis|dynamodb)\b/i, 'a specific datastore is named in the request'],
  [/\boffline\b/i, 'local storage that survives without connectivity'],
  [/\b(cache|caching)\b/i, 'a caching layer'],
  [/\b(search|full[- ]text)\b/i, 'a search index'],
];

const PACKAGING_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\bdocker(?:file|ised|ized)?\b/i, 'a container image'],
  [/\b(installer|packaged|distributable|binary)\b/i, 'a distributable artefact'],
  [/\b(app ?store|play store|published)\b/i, 'store or registry distribution, which needs owner credentials'],
];

function titleFrom(prompt: string): string {
  const firstSentence = prompt.trim().split(/[.!?\n]/)[0] ?? prompt;
  const cleaned = firstSentence.replace(/^\s*(please\s+)?(build|create|make|write|develop|add)\s+(me\s+)?(a|an|the)?\s*/i, '').trim();
  const title = cleaned || prompt.trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

/**
 * Surfaces for a request.
 *
 * Everything scoring at least 60% of the top score is kept, so a genuine second surface
 * survives while noise does not. An absolute threshold would either drop the worker from
 * "a Go service with a background cleanup worker" or admit every weak match; the ratio
 * adapts to how strongly the request was phrased.
 */
export function inferSurfaces(prompt: string, files: readonly ProjectFile[] = []): readonly SurfaceDeclaration[] {
  const scores = new Map<ProductSurface, { score: number; reasons: string[]; evidence: string[] }>();

  for (const rule of RULES) {
    const match = prompt.match(rule.pattern);
    if (!match) continue;
    const entry = scores.get(rule.surface) ?? { score: 0, reasons: [], evidence: [] };
    entry.score += rule.weight;
    entry.reasons.push(rule.reason);
    entry.evidence.push(`request mentions "${match[0]}"`);
    scores.set(rule.surface, entry);
  }

  // An existing repository is stronger evidence than any phrasing: if a Cargo binary is
  // already here, the product has a CLI surface whatever the prompt calls it.
  if (files.length) {
    for (const component of detectComposition(files).components) {
      const { inspection } = component;
      if (inspection.entrypoints.some((entry) => entry.endsWith('src/main.rs'))) {
        const entry = scores.get('cli') ?? { score: 0, reasons: [], evidence: [] };
        entry.score += 8;
        entry.reasons.push('the repository already contains a binary crate');
        entry.evidence.push(`${component.root || '.'}/src/main.rs`);
        scores.set('cli', entry);
      }
      if (inspection.entrypoints.some((entry) => entry.endsWith('src/lib.rs')) || inspection.buildSystem === 'pep517') {
        const entry = scores.get('library') ?? { score: 0, reasons: [], evidence: [] };
        entry.score += 6;
        entry.reasons.push('the repository is structured as a distributable package');
        entry.evidence.push(component.root || '.');
        scores.set('library', entry);
      }
    }
  }

  if (!scores.size) return [];

  const top = Math.max(...[...scores.values()].map((entry) => entry.score));
  const threshold = top * 0.6;

  const declared = [...scores.entries()]
    .filter(([, entry]) => entry.score >= threshold)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([surface, entry]) => ({
      surface,
      reason: entry.reasons[0],
      evidence: [...new Set(entry.evidence)],
      confidence: Math.min(1, entry.score / 12),
      custom: !(KNOWN_PRODUCT_SURFACES as readonly string[]).includes(surface as string),
    }));

  const result = [...declared];
  for (const implication of IMPLIED) {
    if (!declared.some((d) => d.surface === implication.when)) continue;
    if (result.some((d) => d.surface === implication.add)) continue;
    result.push({
      surface: implication.add,
      reason: implication.reason,
      evidence: [`implied by ${implication.when}`],
      confidence: 0.5,
      custom: false,
    });
  }
  return result;
}

/**
 * Adds a surface the caller determined some other way.
 *
 * The escape hatch that makes the type's openness real. A planner or a model can name a
 * surface this module has never heard of and it becomes a first-class part of the spec,
 * flagged `custom: true` so downstream code can treat it carefully without rejecting it.
 */
export function withCustomSurface(
  spec: UniversalProductSpec,
  surface: ProductSurface,
  reason: string,
  evidence: readonly string[] = [],
): UniversalProductSpec {
  if (spec.surfaces.some((declaration) => declaration.surface === surface)) return spec;
  return {
    ...spec,
    surfaces: [
      ...spec.surfaces,
      {
        surface,
        reason,
        evidence,
        confidence: 0.5,
        custom: !(KNOWN_PRODUCT_SURFACES as readonly string[]).includes(surface as string),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function matchAll(prompt: string, rules: ReadonlyArray<[RegExp, string]>): string[] {
  return rules.filter(([pattern]) => pattern.test(prompt)).map(([, label]) => label);
}

/**
 * Builds a spec from a request and, when present, a repository.
 *
 * A request yielding no surface produces a spec with an empty `surfaces` array and an
 * unresolved question. That is the honest result and the whole point: the old code could
 * not express "I do not know what this is", so it said `'static'` instead and built a
 * website. An empty list is a state later stages can act on — by asking, or by running
 * discovery — and a wrong list is not.
 */
export function synthesizeUniversalProductSpec(input: {
  prompt: string;
  files?: readonly ProjectFile[];
  projectId?: string | null;
  runId?: string | null;
  now?: Date;
}): UniversalProductSpec {
  const prompt = input.prompt ?? '';
  const files = input.files ?? [];
  const timestamp = (input.now ?? new Date()).toISOString();
  const surfaces = inferSurfaces(prompt, files);

  const repositoryEvidence: string[] = [];
  if (files.length) {
    const composition = detectComposition(files);
    for (const component of composition.components) {
      repositoryEvidence.push(
        `${component.root || '.'} is ${component.adapterId} (${component.inspection.packageManager ?? 'no package manager'})`,
      );
    }
    if (composition.polyglot) repositoryEvidence.push('the repository is polyglot; components keep their own toolchains');
  }

  const unresolvedQuestions: string[] = [];
  const blockers: string[] = [];
  if (!surfaces.length) {
    unresolvedQuestions.push(
      'The request does not yet describe what the product does concretely enough to determine its surfaces. ' +
        'This is recorded rather than guessed — defaulting to a website is how a Rust CLI became a static page.',
    );
  }

  const inferred = surfaces
    .filter((declaration) => declaration.confidence < 0.75)
    .map((declaration) => `${declaration.surface} inferred at ${Math.round(declaration.confidence * 100)}% confidence: ${declaration.reason}`);

  return {
    schemaVersion: UNIVERSAL_PRODUCT_SPEC_SCHEMA_VERSION,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
    title: titleFrom(prompt),
    objective: prompt.trim().slice(0, 500),
    requestedOutcome: prompt.trim(),
    surfaces,
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    storageRequirements: matchAll(prompt, STORAGE_RULES),
    integrationRequirements: [],
    packagingRequirements: matchAll(prompt, PACKAGING_RULES),
    acceptanceCriteria: [],
    assumptions: [],
    inferredRequirements: inferred,
    unresolvedQuestions,
    blockers,
    repositoryEvidence,
    sourcePrompt: prompt,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Reads a persisted spec forward.
 *
 * Specs outlive the code that wrote them — §51's follow-up prompts load one months later.
 * Unknown surface strings survive migration unchanged, which is the same openness the type
 * declares: a spec written when `mcp_server` was custom must not lose it once the value
 * becomes known, and one written with a surface this version has never seen must not be
 * silently dropped.
 */
export function migrateUniversalProductSpec(input: Record<string, unknown>): UniversalProductSpec {
  const raw = input as Partial<UniversalProductSpec>;
  const now = new Date().toISOString();
  const surfaces = Array.isArray(raw.surfaces)
    ? raw.surfaces
        .filter((declaration): declaration is SurfaceDeclaration => Boolean(declaration && typeof (declaration as SurfaceDeclaration).surface === 'string'))
        .map((declaration) => ({
          ...declaration,
          custom: !(KNOWN_PRODUCT_SURFACES as readonly string[]).includes(declaration.surface as string),
        }))
    : [];

  const list = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  return {
    schemaVersion: UNIVERSAL_PRODUCT_SPEC_SCHEMA_VERSION,
    projectId: raw.projectId ?? null,
    runId: raw.runId ?? null,
    title: raw.title ?? '',
    objective: raw.objective ?? '',
    requestedOutcome: raw.requestedOutcome ?? raw.objective ?? '',
    surfaces,
    functionalRequirements: list(raw.functionalRequirements),
    nonFunctionalRequirements: list(raw.nonFunctionalRequirements),
    storageRequirements: list(raw.storageRequirements),
    integrationRequirements: list(raw.integrationRequirements),
    packagingRequirements: list(raw.packagingRequirements),
    acceptanceCriteria: list(raw.acceptanceCriteria),
    assumptions: list(raw.assumptions),
    inferredRequirements: list(raw.inferredRequirements),
    unresolvedQuestions: list(raw.unresolvedQuestions),
    blockers: list(raw.blockers),
    repositoryEvidence: list(raw.repositoryEvidence),
    sourcePrompt: raw.sourcePrompt ?? '',
    createdAt: raw.createdAt ?? now,
    updatedAt: now,
  };
}
