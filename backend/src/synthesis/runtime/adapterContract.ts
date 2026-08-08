/**
 * The contract every language ecosystem implements.
 *
 * Before this existed, the answer to "how do I build this project" was spread across the
 * pipeline as literal npm invocations: `compileValidate` read `package.json` and ran
 * `npm run build`, and `architect.ts` asked a model to choose between `static`, `nextjs`,
 * `expo` and `other`. A Cargo project reaching that code did not fail — `shouldCompile`
 * returned false and validation was skipped, so a Rust program was reported as built
 * without anything having compiled it.
 *
 * The fix is not more branches. It is moving the knowledge out of the pipeline entirely:
 * the pipeline asks an adapter what to run, and the adapter answers for its ecosystem.
 * Adding Go should mean adding a file here, not editing the pipeline — that property is
 * what makes the architecture open-ended rather than a longer whitelist, and it is
 * asserted directly by `centralPipelineHasNoLanguageCommands` in the tests.
 *
 * Three rules shape the design.
 *
 * **The repository outranks the adapter.** If `package.json` defines `scripts.test`, that
 * is the test command, even when the adapter would have guessed something reasonable. A
 * project that runs `vitest --run --coverage` under `npm test` must not be handed a bare
 * `vitest`, because the difference is usually deliberate. Every command therefore carries
 * a `source` recording where it came from, and `repository_script` beats `adapter_default`.
 *
 * **Commands are data, never strings to interpolate.** A `ToolCommand` is a binary plus an
 * argv array, which is what the sandbox accepts. There is no shell in the path, so a
 * package name from a manifest cannot become a command substitution.
 *
 * **Absence is not failure.** An adapter returning no build command means the ecosystem
 * has no separate build step, which is true of most Python libraries. A caller must not
 * read that as an error; it reads it as "nothing to run".
 */

import type { ProjectFile } from '../../ai/patches.js';

/**
 * How far an adapter has actually been proven — not how complete its code looks.
 *
 * The distinction that matters is between `implementation_available` and
 * `fixture_verified`. The first says commands are emitted; the second says they were
 * executed and something ran. Command 1 taught this the expensive way: a Fly guest
 * configuration passed every stub test and was rejected by the real API, because a stub
 * replaying a module's own arithmetic agrees with whatever the module computes. An adapter
 * that has never run its toolchain is in exactly that position.
 */
export type AdapterCapabilityState =
  | 'planned'
  | 'detected'
  | 'implementation_available'
  | 'fixture_verified'
  | 'production_observed'
  | 'external_toolchain_required'
  | 'unsupported';

/**
 * Where a command came from, which decides which one wins.
 *
 * Ordered by authority: a script the repository declares beats one derived from its
 * manifest, which beats the adapter's default, which beats anything discovered by
 * inspection. `preferCommand` relies on this ordering rather than on call order.
 */
export type CommandSource =
  | 'repository_script'
  | 'manifest'
  | 'ci_workflow'
  | 'adapter_default'
  | 'discovered';

export const COMMAND_SOURCE_RANK: Readonly<Record<CommandSource, number>> = {
  repository_script: 100,
  manifest: 80,
  ci_workflow: 60,
  adapter_default: 40,
  discovered: 20,
};

/**
 * One executable step.
 *
 * `networkPolicy` is part of the command rather than a caller's decision because only the
 * adapter knows which steps legitimately need a registry. Installing dependencies does;
 * compiling does not. Defaulting the whole run to `registry-only` because one step needs
 * it would hand network access to the compile step for no reason.
 */
export interface ToolCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly networkPolicy: 'none' | 'registry-only';
  readonly source: CommandSource;
  /** Why this command exists, in terms a build log can show a user. */
  readonly purpose: string;
  /** Working directory relative to the repository root. Empty means the root. */
  readonly cwd?: string;
  /**
   * True when a non-zero exit should not fail the run — a formatter that is configured
   * but not installed, for instance. Never true for tests or builds.
   */
  readonly optional?: boolean;
}

/** What an adapter found when it looked at a component. */
export interface ProjectInspection {
  readonly adapterId: string;
  readonly root: string;
  readonly languages: readonly string[];
  readonly manifests: readonly string[];
  readonly lockfiles: readonly string[];
  readonly packageManager: string | null;
  readonly buildSystem: string | null;
  readonly testRunner: string | null;
  /** Workspace member paths, for monorepo-aware ecosystems. */
  readonly workspaces: readonly string[];
  /** Declared entrypoints, where the ecosystem records them. */
  readonly entrypoints: readonly string[];
  /** 0–1. Multiple adapters can match one tree; the highest confidence wins. */
  readonly confidence: number;
  /** Paths and fields that justify the conclusion, for the decision record. */
  readonly evidence: readonly string[];
}

/** A normalised diagnostic, so routing and repair do not each parse raw logs. */
export interface ParsedDiagnostic {
  readonly kind:
    | 'compile_error'
    | 'type_error'
    | 'test_failure'
    | 'lint_error'
    | 'dependency_error'
    | 'toolchain_missing'
    | 'unknown';
  readonly file?: string;
  readonly line?: number;
  readonly message: string;
  /** Whether a bounded automatic repair is worth attempting. */
  readonly repairable: boolean;
}

/**
 * Everything one ecosystem knows about itself.
 *
 * Methods take an inspection rather than raw files so that a monorepo can inspect once per
 * component and ask for commands many times, without re-reading the tree each call.
 */
export interface RuntimeAdapter {
  readonly id: string;
  readonly adapterVersion: string;
  readonly displayName: string;
  readonly languages: readonly string[];
  readonly runtimes: readonly string[];
  readonly platforms: readonly string[];
  readonly capabilityState: AdapterCapabilityState;

  /** Files that mean "this ecosystem is present", used before a full inspection. */
  readonly manifestNames: readonly string[];

  /**
   * Whether running a command at the workspace root also covers its members.
   *
   * True for Cargo: `cargo test` at a workspace root tests every member, so treating each
   * member as its own component would compile and test the same code once per member.
   * False for npm workspaces, where a root `npm test` frequently runs nothing at all and
   * each package has its own scripts — collapsing those would silently skip their suites.
   *
   * Defaults to false, because skipping a member's tests is the more expensive mistake:
   * duplicated work is slow and visible, while an unrun suite looks exactly like a
   * passing one.
   */
  readonly rootCommandCoversWorkspace?: boolean;

  /** Null when this ecosystem is not present at `root`. */
  detect(files: readonly ProjectFile[], root?: string): ProjectInspection | null;

  installCommands(inspection: ProjectInspection): readonly ToolCommand[];
  formatCommands(inspection: ProjectInspection): readonly ToolCommand[];
  lintCommands(inspection: ProjectInspection): readonly ToolCommand[];
  typecheckCommands(inspection: ProjectInspection): readonly ToolCommand[];
  unitTestCommands(inspection: ProjectInspection): readonly ToolCommand[];
  buildCommands(inspection: ProjectInspection): readonly ToolCommand[];
  packageCommands(inspection: ProjectInspection): readonly ToolCommand[];

  /** Artefacts that must exist after a successful build, as repo-relative globs. */
  artifactLocations(inspection: ProjectInspection): readonly string[];

  /** Environment variables the toolchain needs, never secrets. */
  environmentRequirements(inspection: ProjectInspection): Readonly<Record<string, string>>;

  parseFailure(output: string): readonly ParsedDiagnostic[];
  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[];
}

/** Path helpers. Repository paths are POSIX regardless of the host OS. */
export function joinPath(root: string, name: string): string {
  if (!root) return name;
  return `${root.replace(/\/+$/, '')}/${name}`;
}

export function dirOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function fileAt(
  files: readonly ProjectFile[],
  root: string,
  name: string,
): ProjectFile | undefined {
  const target = joinPath(root, name);
  return files.find((file) => file.path === target);
}

/**
 * Picks the command a caller should actually run.
 *
 * Exists because "the repository outranks the adapter" has to be enforced somewhere, and
 * leaving it to each adapter's ordering would make it a convention rather than a rule.
 * Equal ranks keep the earlier command, so an adapter listing its preferred default first
 * still gets its way among its own defaults.
 */
export function preferCommand(commands: readonly ToolCommand[]): ToolCommand | null {
  let best: ToolCommand | null = null;
  for (const command of commands) {
    if (!best || COMMAND_SOURCE_RANK[command.source] > COMMAND_SOURCE_RANK[best.source]) {
      best = command;
    }
  }
  return best;
}

/** Reads a JSON manifest without throwing on the malformed ones models produce. */
export function readJson<T = Record<string, unknown>>(content: string | undefined): T | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Reads the handful of TOML shapes these adapters need.
 *
 * Deliberately not a TOML parser. It answers two questions — does section `[x.y]` exist,
 * and what is `key = "value"` inside it — which covers `[tool.poetry]`, `[project]` and
 * `[workspace]`. Anything more (arrays of tables, multi-line strings, dotted keys) is not
 * attempted, because a half-correct parser that silently mis-reads a manifest is worse
 * than one whose limits are known. Adapters needing real TOML should depend on a parser
 * rather than extend this.
 */
export function tomlSection(content: string | undefined, section: string): boolean {
  if (!content) return false;
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*\\[\\s*${escaped}\\s*\\]`, 'm').test(content);
}

export function tomlValue(
  content: string | undefined,
  section: string,
  key: string,
): string | null {
  if (!content) return null;
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = content.search(new RegExp(`^\\s*\\[\\s*${escapedSection}\\s*\\]`, 'm'));
  if (start === -1) return null;
  const rest = content.slice(start);
  const nextSection = rest.slice(1).search(/^\s*\[/m);
  const body = nextSection === -1 ? rest : rest.slice(0, nextSection + 1);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']*)["']`, 'm'));
  return match ? match[1] : null;
}
