/**
 * Which adapter owns which part of the tree.
 *
 * The single most important property here is that this returns a *list*. A repository is
 * not "a Python repository"; it is a set of components, each with its own toolchain. The
 * polyglot case from §28 — a TypeScript frontend, a Python service and a Rust worker in
 * one tree — is not a special mode, it is what falls out of detecting per directory
 * instead of once at the root.
 *
 * Getting that wrong is not cosmetic. A single repository-wide decision means running
 * `npm install` inside `worker/` because `frontend/package.json` was found first, which
 * fails in a way that looks like a broken project rather than a broken assumption. §59
 * pins this with a fixture asserting no npm command is ever issued in the Rust or Python
 * components.
 *
 * Two rules resolve overlaps.
 *
 * **Nearest manifest wins.** A file belongs to the closest component root above it, so a
 * `frontend/package.json` inside a Cargo workspace claims `frontend/`, not the whole tree.
 *
 * **Confidence breaks ties at the same root.** A directory holding both `Cargo.toml` and a
 * stray `.py` script is Rust: the manifest scores 1, loose sources score 0.55.
 */

import type { ProjectFile } from '../../ai/patches.js';
import { dirOf, type ProjectInspection, type RuntimeAdapter, type ToolCommand } from './adapterContract.js';
import { NodeRuntimeAdapter } from './nodeAdapter.js';
import { PythonRuntimeAdapter } from './pythonAdapter.js';
import { RustRuntimeAdapter } from './rustAdapter.js';

/** One detected component: a root, the adapter that owns it, and the evidence. */
export interface DetectedComponent {
  readonly root: string;
  readonly adapterId: string;
  readonly inspection: ProjectInspection;
}

export interface RepositoryComposition {
  readonly components: readonly DetectedComponent[];
  /** Roots holding files no adapter claimed — the input to generic discovery (§12). */
  readonly unclaimedRoots: readonly string[];
  readonly polyglot: boolean;
}

let registry: RuntimeAdapter[] | null = null;

function defaults(): RuntimeAdapter[] {
  return [new NodeRuntimeAdapter(), new PythonRuntimeAdapter(), new RustRuntimeAdapter()];
}

export function runtimeAdapters(): readonly RuntimeAdapter[] {
  if (!registry) registry = defaults();
  return registry;
}

/**
 * Adds an adapter.
 *
 * This is the seam that makes §11 additive: supporting Go means registering a Go adapter,
 * not editing the planner, the pipeline or this file's logic. Re-registering the same id
 * replaces the previous entry so a synthesised adapter (§12) can be promoted in place once
 * it has been validated.
 */
export function registerRuntimeAdapter(adapter: RuntimeAdapter): void {
  const list = runtimeAdapters() as RuntimeAdapter[];
  const existing = list.findIndex((candidate) => candidate.id === adapter.id);
  if (existing >= 0) list[existing] = adapter;
  else list.push(adapter);
}

/** Test seam. `null` restores the built-in adapters. */
export function setRuntimeAdaptersForTesting(adapters: RuntimeAdapter[] | null): void {
  registry = adapters;
}

export function adapterById(id: string): RuntimeAdapter | null {
  return runtimeAdapters().find((adapter) => adapter.id === id) ?? null;
}

/**
 * Every directory that could be a component root.
 *
 * Only directories containing a file some adapter names as a manifest are considered, plus
 * the repository root. Probing every directory would be both slower and wrong — `src/` is
 * not a component just because it holds sources.
 */
function candidateRoots(files: readonly ProjectFile[], adapters: readonly RuntimeAdapter[]): string[] {
  const manifestNames = new Set<string>();
  for (const adapter of adapters) for (const name of adapter.manifestNames) manifestNames.add(name);

  const roots = new Set<string>(['']);
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const base = slash === -1 ? file.path : file.path.slice(slash + 1);
    if (manifestNames.has(base)) roots.add(dirOf(file.path));
  }
  // Shallower roots first, so `nearest wins` can be applied by later entries overriding.
  return [...roots].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}

/**
 * Detects every component in a repository.
 *
 * A component root is kept only when it adds something its parent does not. Without that
 * check a Cargo workspace would report the root plus every member as separate components,
 * and validation would build the same code once per member.
 */
export function detectComposition(files: readonly ProjectFile[]): RepositoryComposition {
  const adapters = runtimeAdapters();
  const components: DetectedComponent[] = [];
  const claimed = new Set<string>();

  for (const root of candidateRoots(files, adapters)) {
    let best: { adapter: RuntimeAdapter; inspection: ProjectInspection } | null = null;
    for (const adapter of adapters) {
      const inspection = adapter.detect(files, root);
      if (!inspection) continue;
      if (!best || inspection.confidence > best.inspection.confidence) {
        best = { adapter, inspection };
      }
    }
    if (!best) continue;

    // A workspace member is folded into its parent only when the parent's own command
    // already covers it — true for Cargo, false for npm workspaces, where a root
    // `npm test` frequently runs nothing and each package owns its scripts. A member with
    // a *different* adapter is always its own component, which is how a Python service
    // nested inside a Node monorepo keeps its own toolchain.
    const parent = components.find(
      (candidate) =>
        root !== candidate.root &&
        (candidate.root === '' || root.startsWith(`${candidate.root}/`)) &&
        candidate.adapterId === best!.adapter.id &&
        candidate.inspection.workspaces.includes(root),
    );
    if (parent && adapterById(parent.adapterId)?.rootCommandCoversWorkspace) continue;

    components.push({ root, adapterId: best.adapter.id, inspection: best.inspection });
    claimed.add(root);
  }

  const unclaimedRoots = unclaimed(files, components);
  const languages = new Set(components.flatMap((component) => component.inspection.languages));

  return {
    components,
    unclaimedRoots,
    // Two adapters, or one adapter over genuinely different languages, both count.
    polyglot: new Set(components.map((c) => c.adapterId)).size > 1 || languages.size > 2,
  };
}

/**
 * Top-level directories no adapter claimed.
 *
 * These are the input to generic runtime discovery. Reporting them is what separates "we
 * do not support this" from "nothing here matched a known adapter, so inspect it" — the
 * difference between a whitelist and an open architecture.
 */
function unclaimed(
  files: readonly ProjectFile[],
  components: readonly DetectedComponent[],
): string[] {
  const roots = components.map((component) => component.root);
  const covered = (path: string) =>
    roots.some((root) => root === '' || path === root || path.startsWith(`${root}/`));

  const out = new Set<string>();
  for (const file of files) {
    const dir = dirOf(file.path);
    if (covered(dir)) continue;
    // Report the top-level directory rather than every nested path, so the result stays
    // a short list of places to look rather than a copy of the tree.
    out.add(dir.split('/')[0] || dir);
  }
  return [...out].filter(Boolean).sort();
}

/**
 * The component that owns a file.
 *
 * Deepest matching root wins, which is what makes "nearest manifest" real rather than a
 * comment. Used to decide which suite to run for a change (§29) — editing one workspace
 * package should not run every other package's tests.
 */
export function componentForPath(
  composition: RepositoryComposition,
  path: string,
): DetectedComponent | null {
  let best: DetectedComponent | null = null;
  for (const component of composition.components) {
    const matches = component.root === '' || path === component.root || path.startsWith(`${component.root}/`);
    if (!matches) continue;
    if (!best || component.root.length > best.root.length) best = component;
  }
  return best;
}

export type ValidationPhase =
  | 'install'
  | 'format'
  | 'lint'
  | 'typecheck'
  | 'test'
  | 'build'
  | 'package';

/**
 * The commands for one component and phase.
 *
 * The only place the pipeline needs to know about running anything, and it names no
 * language. `commandsFor(component, 'test')` returns `cargo test` or `pytest -q` or
 * `npm run test` according to what the component is — which is the whole contract, stated
 * as one function.
 */
export function commandsFor(
  component: DetectedComponent,
  phase: ValidationPhase,
): readonly ToolCommand[] {
  const adapter = adapterById(component.adapterId);
  if (!adapter) return [];
  const { inspection } = component;
  switch (phase) {
    case 'install':
      return adapter.installCommands(inspection);
    case 'format':
      return adapter.formatCommands(inspection);
    case 'lint':
      return adapter.lintCommands(inspection);
    case 'typecheck':
      return adapter.typecheckCommands(inspection);
    case 'test':
      return adapter.unitTestCommands(inspection);
    case 'build':
      return adapter.buildCommands(inspection);
    case 'package':
      return adapter.packageCommands(inspection);
    default:
      return [];
  }
}

/**
 * Parses a failure using the adapter that produced it.
 *
 * Routing a Cargo error through the Node parser yields no diagnostics and a repair loop
 * with nothing to work from, so the component always decides who reads the output.
 */
export function parseFailureFor(component: DetectedComponent, output: string) {
  const adapter = adapterById(component.adapterId);
  return adapter ? adapter.parseFailure(output) : [];
}
