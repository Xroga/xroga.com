/**
 * Working out how to build a repository nobody wrote an adapter for.
 *
 * This is the difference between an open architecture and a longer whitelist. Three
 * adapters plus a marker table still means a Nim project, a Haskell project or an
 * in-house build tool is unbuildable — unless the repository can be asked, and it usually
 * can. Projects state how they are built, in several places, with different reliability.
 *
 * Evidence is therefore ranked, and the ranking is the substance of this module:
 *
 *   1. **CI workflows.** A maintained, executable statement of how the project builds,
 *      run on every push. If `.github/workflows/ci.yml` says `nimble test`, that is not a
 *      guess — it is what the maintainers run and what passes.
 *   2. **Container definitions.** `RUN` lines are executable and versioned, though they
 *      may target an image whose tools we do not have.
 *   3. **Makefile targets.** Conventional (`make build`, `make test`) and executable, but
 *      the convention is weaker than it looks and targets can mean anything.
 *   4. **Documentation.** A README fence is often right and often stale, and it is prose
 *      written for humans rather than something anything verifies.
 *   5. **Shebangs and extensions.** Last, because they identify a language rather than a
 *      build.
 *
 * Everything here is **provisional**. §12 is explicit that a synthesised adapter must not
 * be trusted until its commands actually run, and the reason is Command 1's most expensive
 * lesson: a Fly guest configuration passed every stub test and was rejected by the live
 * API, because a stub replaying a module's own reasoning agrees with it. A command derived
 * from a README has exactly that character until something executes it.
 *
 * So `deriveRuntimeCapability` produces a candidate, `validateRuntimeCapability` runs it in
 * the Command 1 sandbox, and only a validated spec becomes a registered adapter. An
 * unvalidated one is reported as a blocker naming what was found and what could not be
 * confirmed — never as a build result.
 */

import type { ProjectFile } from '../../ai/patches.js';
import {
  discoverRepository,
  type GenericSignal,
  type RepositoryDiscovery,
} from './repositoryDiscovery.js';
import type {
  AdapterCapabilityState,
  ProjectInspection,
  ParsedDiagnostic,
  RuntimeAdapter,
  ToolCommand,
} from './adapterContract.js';

/** Confidence in a command, from where it was found. */
export type EvidenceRank = 'ci_workflow' | 'container' | 'make_target' | 'documentation' | 'inferred';

const RANK_ORDER: Readonly<Record<EvidenceRank, number>> = {
  ci_workflow: 100,
  container: 80,
  make_target: 60,
  documentation: 40,
  inferred: 20,
};

export interface CandidateCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly rank: EvidenceRank;
  readonly sourcePath: string;
  readonly rawLine: string;
  readonly phase: 'install' | 'test' | 'build' | 'lint' | 'unknown';
}

export interface RuntimeCapabilitySpec {
  readonly ecosystem: string;
  readonly displayName: string;
  readonly languages: readonly string[];
  readonly candidates: readonly CandidateCommand[];
  readonly install: CandidateCommand | null;
  readonly test: CandidateCommand | null;
  readonly build: CandidateCommand | null;
  readonly evidence: readonly string[];
  /** Commands found and refused, with the reason. Reported, never silently dropped. */
  readonly rejected: ReadonlyArray<{ line: string; reason: string }>;
  readonly validated: boolean;
  readonly confidence: number;
}

/**
 * Commands never run, whatever a repository claims.
 *
 * The sandbox is the real boundary — this runs inside a disposable microVM with egress
 * denied — but defence in depth is cheap and these are never legitimate build steps. A
 * README is untrusted input in exactly the way §24 describes for retrieved pages: it is
 * content authored by whoever opened the pull request.
 *
 * The pipe-to-shell pattern matters most. `curl … | sh` is a real install instruction in
 * real projects, and it is also the exact shape of a supply-chain compromise. Refusing it
 * costs a little coverage and removes the whole class.
 */
const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(?:curl|wget)\b[\s\S]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i, reason: 'pipes a download straight into a shell' },
  { pattern: /\bsudo\b/, reason: 'requests privilege escalation' },
  { pattern: /\brm\s+-[a-z]*[rf]/i, reason: 'recursive or forced deletion' },
  { pattern: /\b(?:mkfs|dd|shutdown|reboot|halt)\b/i, reason: 'destructive or host-level operation' },
  { pattern: /\b(?:chmod|chown)\s+-R\b/i, reason: 'recursive permission change' },
  { pattern: /\bssh\b|\bscp\b|\brsync\b.*::/i, reason: 'reaches another host' },
  { pattern: /\b(?:git)\s+push\b/i, reason: 'writes to a remote repository' },
  { pattern: />\s*\/(?:dev|etc|proc|sys)\//, reason: 'writes outside the workspace' },
  { pattern: /\$\(|\`/, reason: 'contains command substitution' },
];

/**
 * Shell syntax that cannot survive into an argv array.
 *
 * A `ToolCommand` is a binary plus arguments with no shell, so anything whose meaning
 * depends on a shell would silently change behaviour if passed through as literal text —
 * `cmd && other` would become an argument called `&&`. Refusing is honest; splitting on
 * the operator would be inventing a command the repository never wrote.
 */
const SHELL_SYNTAX = /[|&;<>]|\$\{|\*|\?\[/;

function classify(command: string, args: readonly string[]): CandidateCommand['phase'] {
  const text = `${command} ${args.join(' ')}`.toLowerCase();
  if (/\b(test|check|spec)\b/.test(text)) return 'test';
  if (/\b(install|deps|dependencies|restore|fetch|get|sync|download|bootstrap)\b/.test(text)) return 'install';
  if (/\b(build|compile|make|dist|release|package)\b/.test(text)) return 'build';
  if (/\b(lint|fmt|format|clippy|vet)\b/.test(text)) return 'lint';
  return 'unknown';
}

/**
 * Splits a command line into argv.
 *
 * Handles quoted arguments and nothing else, deliberately. Anything requiring shell
 * semantics is refused above rather than approximated here — a parser that half-understands
 * `&&` produces a command the repository never wrote, which is worse than no command.
 */
function toArgv(line: string): readonly string[] | null {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const character of line.trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (/\s/.test(character)) {
      if (current) { parts.push(current); current = ''; }
      continue;
    }
    current += character;
  }
  if (current) parts.push(current);
  if (quote) return null;
  return parts.length ? parts : null;
}

/** Turns a discovered line into a candidate, or explains why it cannot be one. */
export function candidateFromLine(
  line: string,
  rank: EvidenceRank,
  sourcePath: string,
): { candidate: CandidateCommand } | { rejected: { line: string; reason: string } } {
  const trimmed = line.trim();
  if (!trimmed) return { rejected: { line, reason: 'empty' } };

  for (const { pattern, reason } of FORBIDDEN) {
    if (pattern.test(trimmed)) return { rejected: { line: trimmed, reason } };
  }
  if (SHELL_SYNTAX.test(trimmed)) {
    return { rejected: { line: trimmed, reason: 'requires shell interpretation, which the sandbox does not provide' } };
  }

  const argv = toArgv(trimmed);
  if (!argv) return { rejected: { line: trimmed, reason: 'could not be parsed into arguments' } };

  // Shell builtins and directory changes describe context rather than a build step.
  if (/^(cd|export|source|\.|set|echo|if|for|while|then|fi|done)$/.test(argv[0])) {
    return { rejected: { line: trimmed, reason: `"${argv[0]}" is shell context rather than a build step` } };
  }

  const [command, ...args] = argv;
  return { candidate: { command, args, rank, sourcePath, rawLine: trimmed, phase: classify(command, args) } };
}

function bestFor(
  candidates: readonly CandidateCommand[],
  phase: CandidateCommand['phase'],
): CandidateCommand | null {
  const matching = candidates.filter((candidate) => candidate.phase === phase);
  if (!matching.length) return null;
  return matching.reduce((best, candidate) =>
    RANK_ORDER[candidate.rank] > RANK_ORDER[best.rank] ? candidate : best,
  );
}

const SIGNAL_RANK: Readonly<Record<GenericSignal['kind'], EvidenceRank | null>> = {
  ci_workflow: 'ci_workflow',
  container: 'container',
  make_target: 'make_target',
  documentation: 'documentation',
  shebang: null,
  extension: null,
};

/**
 * Derives a provisional capability spec from repository evidence.
 *
 * `validated: false` always. Nothing here has run, and the entire contract of this module
 * is that a derived command is a hypothesis until something executes it.
 */
export function deriveRuntimeCapability(
  files: readonly ProjectFile[],
  discovery: RepositoryDiscovery = discoverRepository(files),
): RuntimeCapabilitySpec | null {
  if (!discovery.needsRuntimeDiscovery) return null;

  const candidates: CandidateCommand[] = [];
  const rejected: Array<{ line: string; reason: string }> = [];
  const evidence: string[] = [];

  for (const signal of discovery.generic) {
    const rank = SIGNAL_RANK[signal.kind];
    if (!rank || !signal.suggestedCommand) continue;
    const result = candidateFromLine(signal.suggestedCommand, rank, signal.path);
    if ('candidate' in result) {
      candidates.push(result.candidate);
      evidence.push(`${signal.kind} at ${signal.path}: ${result.candidate.rawLine}`);
    } else if (result.rejected.reason !== 'empty') {
      rejected.push(result.rejected);
    }
  }

  const languages = [
    ...new Set(
      discovery.generic
        .filter((signal) => signal.kind === 'extension')
        .map((signal) => signal.detail.replace(/^\d+\s+/, '').replace(/\s+source file\(s\)$/, '')),
    ),
  ];

  // The ecosystem name comes from a recognised-but-unbuildable marker where one exists,
  // so the spec says "Elixir" rather than "unknown" when mix.exs is sitting right there.
  const named = discovery.unsupported[0];
  const ecosystem = named?.ecosystem ?? languages[0] ?? 'unknown';
  const displayName = named?.displayName ?? (languages[0] ? `${languages[0]} (discovered)` : 'Unrecognised toolchain');

  if (!candidates.length) {
    return {
      ecosystem, displayName, languages, candidates: [], install: null, test: null, build: null,
      evidence: evidence.length ? evidence : ['no executable evidence found in CI, containers, Makefiles or documentation'],
      rejected, validated: false, confidence: 0,
    };
  }

  const install = bestFor(candidates, 'install');
  const test = bestFor(candidates, 'test');
  const build = bestFor(candidates, 'build');

  // Confidence tracks the strength of the *evidence*, not how many commands were found. A
  // single CI test command is worth more than four README lines.
  const strongest = Math.max(...candidates.map((candidate) => RANK_ORDER[candidate.rank]));
  const confidence = Math.min(0.9, (strongest / 100) * (test ? 1 : 0.6));

  return {
    ecosystem, displayName, languages, candidates,
    install, test, build, evidence, rejected,
    // Never true here. Only validateRuntimeCapability can set it.
    validated: false,
    confidence,
  };
}

export interface CommandRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one command under isolation. Supplied by the caller so this module stays pure. */
export type SandboxRunner = (command: ToolCommand) => Promise<CommandRun>;

export interface ValidationOutcome {
  readonly spec: RuntimeCapabilitySpec;
  readonly ran: ReadonlyArray<{ phase: string; argv: string; exitCode: number | null }>;
  readonly blocker: string | null;
}

function asToolCommand(candidate: CandidateCommand, phase: CandidateCommand['phase']): ToolCommand {
  return {
    command: candidate.command,
    args: candidate.args,
    // Only install may reach a registry, exactly as for the written adapters.
    networkPolicy: phase === 'install' ? 'registry-only' : 'none',
    source: 'discovered',
    purpose: `${phase} command discovered from ${candidate.sourcePath}`,
  };
}

/**
 * Executes a derived spec to find out whether it is real.
 *
 * The gate §12 requires. A spec whose test command exits non-zero, or whose toolchain is
 * absent from the sandbox image, stays `validated: false` and produces a blocker naming
 * what was tried. That blocker is the honest output — the failure mode being prevented is
 * a synthesised adapter reporting success because its commands looked plausible.
 *
 * A missing toolchain is reported differently from a failing test, because they call for
 * different responses: the first needs a sandbox image change and no amount of code
 * editing will fix it, while the second is a genuine repository failure.
 */
export async function validateRuntimeCapability(
  spec: RuntimeCapabilitySpec,
  run: SandboxRunner,
): Promise<ValidationOutcome> {
  const ran: Array<{ phase: string; argv: string; exitCode: number | null }> = [];

  if (!spec.test && !spec.build) {
    return {
      spec,
      ran,
      blocker:
        `No test or build command could be derived for ${spec.displayName}. ` +
        `Evidence examined: ${spec.evidence.join('; ') || 'none'}. Nothing was executed.`,
    };
  }

  for (const [phase, candidate] of [['install', spec.install], ['build', spec.build], ['test', spec.test]] as const) {
    if (!candidate) continue;
    const result = await run(asToolCommand(candidate, phase));
    const argv = `${candidate.command} ${candidate.args.join(' ')}`.trim();
    ran.push({ phase, exitCode: result.exitCode, argv });

    const combined = `${result.stdout}\n${result.stderr}`;
    if (/command not found|is not recognized as an internal|No such file or directory/i.test(combined)) {
      return {
        spec,
        ran,
        blocker:
          `${spec.displayName}: "${argv}" could not run because the toolchain is not installed in the sandbox image. ` +
          `The command was derived from ${candidate.sourcePath} and is probably correct; the environment cannot execute it. ` +
          `No source change can fix this.`,
      };
    }

    // Install may legitimately fail without invalidating the rest — a registry can be
    // unreachable under a denied-egress policy — but build and test are decisive.
    if (phase !== 'install' && result.exitCode !== 0) {
      return {
        spec,
        ran,
        blocker:
          `${spec.displayName}: "${argv}" exited ${result.exitCode ?? 'null'}. ` +
          `The derived command ran but did not succeed, so this toolchain is not confirmed.`,
      };
    }
  }

  const decisive = ran.find((entry) => entry.phase === 'test') ?? ran.find((entry) => entry.phase === 'build');
  if (!decisive || decisive.exitCode !== 0) {
    return { spec, ran, blocker: `${spec.displayName}: no decisive command completed successfully.` };
  }

  return {
    spec: { ...spec, validated: true, confidence: Math.max(spec.confidence, 0.95) },
    ran,
    blocker: null,
  };
}

/**
 * Builds an adapter from a validated spec.
 *
 * Refuses an unvalidated one outright rather than returning something weaker, because a
 * registered adapter is consulted by the planner as an equal to the written ones. Letting
 * an unproven adapter in would put a README guess on the same footing as the Cargo adapter,
 * and the difference between those would then be invisible at the point it matters.
 *
 * The capability state is `fixture_verified`, not `production_observed`: the commands ran
 * once, on one repository. That is real evidence and it is not a track record.
 */
export function synthesizeAdapter(spec: RuntimeCapabilitySpec): RuntimeAdapter {
  if (!spec.validated) {
    throw new Error(
      `Refusing to synthesise an adapter for ${spec.displayName}: its commands have not been validated. ` +
        `Call validateRuntimeCapability first — an unvalidated command is a hypothesis, not a toolchain.`,
    );
  }

  const capabilityState: AdapterCapabilityState = 'fixture_verified';
  const only = (candidate: CandidateCommand | null, network: 'none' | 'registry-only', purpose: string): readonly ToolCommand[] =>
    candidate
      ? [{ command: candidate.command, args: candidate.args, networkPolicy: network, source: 'discovered', purpose: `${purpose} (from ${candidate.sourcePath})` }]
      : [];

  return {
    id: `discovered:${spec.ecosystem}`,
    adapterVersion: '0.1.0',
    displayName: `${spec.displayName} (discovered)`,
    languages: spec.languages,
    runtimes: [spec.ecosystem],
    platforms: ['linux'],
    capabilityState,
    // No manifest names: this adapter was derived for a specific repository shape rather
    // than from a marker, so it must not claim to recognise trees it has never seen.
    manifestNames: [],

    detect: (files, root = '') =>
      files.length
        ? {
            adapterId: `discovered:${spec.ecosystem}`, root, languages: spec.languages,
            manifests: [], lockfiles: [], packageManager: null, buildSystem: spec.ecosystem,
            testRunner: spec.test ? 'discovered' : null, workspaces: [], entrypoints: [],
            // Deliberately below a written adapter's 1: a real adapter must always win.
            confidence: 0.5,
            evidence: [...spec.evidence],
          }
        : null,

    installCommands: () => only(spec.install, 'registry-only', 'Install dependencies'),
    formatCommands: () => [],
    lintCommands: () => [],
    typecheckCommands: () => [],
    unitTestCommands: () => only(spec.test, 'none', 'Run tests'),
    buildCommands: () => only(spec.build, 'none', 'Build'),
    packageCommands: () => [],
    artifactLocations: () => [],
    environmentRequirements: () => ({}),

    parseFailure: (output: string): readonly ParsedDiagnostic[] => {
      // No ecosystem-specific parser exists, so this reports only what any toolchain
      // reports the same way. Inventing patterns for a language nobody has modelled would
      // produce confident nonsense in the repair loop.
      if (/command not found|is not recognized as an internal/i.test(output)) {
        return [{ kind: 'toolchain_missing', message: 'The discovered toolchain is not installed in the sandbox', repairable: false }];
      }
      return [{ kind: 'unknown', message: output.slice(0, 500), repairable: false }];
    },

    repairHints: () => [
      'This adapter was discovered from repository evidence rather than written, so its diagnostics are not structured. Read the raw output before changing anything.',
    ],
  };
}

/** A user-facing summary of what discovery concluded. */
export function describeCapability(spec: RuntimeCapabilitySpec): string {
  if (!spec.candidates.length) {
    return `${spec.displayName}: no build or test command could be found in CI configuration, container definitions, Makefiles or documentation.`;
  }
  const lines = [
    `${spec.displayName} — ${spec.validated ? 'validated' : 'provisional, not yet executed'}`,
    ...(spec.install ? [`  install: ${spec.install.command} ${spec.install.args.join(' ')} (from ${spec.install.sourcePath})`] : []),
    ...(spec.build ? [`  build:   ${spec.build.command} ${spec.build.args.join(' ')} (from ${spec.build.sourcePath})`] : []),
    ...(spec.test ? [`  test:    ${spec.test.command} ${spec.test.args.join(' ')} (from ${spec.test.sourcePath})`] : []),
  ];
  if (spec.rejected.length) {
    lines.push(`  refused: ${spec.rejected.map((entry) => `"${entry.line}" (${entry.reason})`).join('; ')}`);
  }
  return lines.join('\n');
}
