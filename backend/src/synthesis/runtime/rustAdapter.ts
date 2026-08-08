/**
 * Rust and Cargo.
 *
 * The simplest of the three adapters, because Cargo is the only package manager, the only
 * build system and the only test runner. There is no workflow to detect — which makes this
 * the clearest demonstration of what the adapter contract is for: the pipeline gains
 * `cargo build --release` without learning what Cargo is.
 *
 * Two details are worth stating because guessing them wrong produces confident nonsense.
 *
 * A `Cargo.toml` with a `[workspace]` section and no `[package]` section is a *virtual
 * manifest*. It declares members and builds nothing itself. Running `cargo build` there
 * builds every member, which is usually right, but treating it as a crate with a binary
 * and looking for `target/release/<name>` is wrong — there is no name to find, because
 * virtual manifests have no `package.name`.
 *
 * And the artefact path depends on the crate's shape. A `[[bin]]` or `src/main.rs` yields
 * `target/release/<name>`; a library yields `target/release/lib<name>.rlib`. Asserting the
 * binary path for a library crate fails a build that in fact succeeded, so the artefact
 * list is derived from which source files exist rather than assumed.
 */

import type { ProjectFile } from '../../ai/patches.js';
import {
  fileAt,
  joinPath,
  tomlSection,
  tomlValue,
  type ProjectInspection,
  type ParsedDiagnostic,
  type RuntimeAdapter,
  type ToolCommand,
} from './adapterContract.js';

export class RustRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'rust';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Rust / Cargo';
  readonly languages = ['rust'] as const;
  readonly runtimes = ['native'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly manifestNames = ['Cargo.toml'] as const;
  /** Verified on a real machine: cargo 1.97.1. */
  readonly sandboxImage = 'registry-1.docker.io/library/rust:1-alpine';
  /** `cargo test` at a workspace root already tests every member. */
  readonly rootCommandCoversWorkspace = true;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const manifest = fileAt(files, root, 'Cargo.toml');
    if (!manifest) return null;

    const content = manifest.content;
    const evidence: string[] = [joinPath(root, 'Cargo.toml')];

    const isWorkspace = tomlSection(content, 'workspace');
    const isPackage = tomlSection(content, 'package');
    const crateName = tomlValue(content, 'package', 'name');

    const lockfiles: string[] = [];
    if (fileAt(files, root, 'Cargo.lock')) {
      lockfiles.push(joinPath(root, 'Cargo.lock'));
      // Committed for binaries, usually absent for libraries. Its presence means the exact
      // resolved versions are known, so `--locked` is safe.
      evidence.push('Cargo.lock is committed; builds can be reproduced exactly');
    }

    const prefix = root ? `${root}/` : '';
    const hasMain = Boolean(fileAt(files, root, 'src/main.rs'));
    const hasLib = Boolean(fileAt(files, root, 'src/lib.rs'));
    const hasBinDir = files.some((f) => f.path.startsWith(`${prefix}src/bin/`) && f.path.endsWith('.rs'));

    const entrypoints: string[] = [];
    if (hasMain) {
      entrypoints.push(joinPath(root, 'src/main.rs'));
      evidence.push('src/main.rs means a binary crate');
    }
    if (hasLib) {
      entrypoints.push(joinPath(root, 'src/lib.rs'));
      evidence.push('src/lib.rs means a library crate');
    }
    if (hasBinDir) evidence.push('src/bin/ declares additional binaries');

    const workspaces: string[] = [];
    if (isWorkspace) {
      evidence.push(
        isPackage
          ? 'Cargo.toml is a workspace root that is itself a package'
          : 'Cargo.toml is a virtual manifest: it declares members and builds nothing itself',
      );
      for (const file of files) {
        if (!file.path.endsWith('/Cargo.toml')) continue;
        const dir = file.path.slice(0, -'/Cargo.toml'.length);
        if (dir === root || !dir.startsWith(prefix)) continue;
        workspaces.push(dir);
      }
      workspaces.sort();
    }

    return {
      adapterId: this.id,
      root,
      languages: ['rust'],
      manifests: [joinPath(root, 'Cargo.toml')],
      lockfiles,
      packageManager: 'cargo',
      buildSystem: 'cargo',
      // Cargo runs `#[test]` functions and tests/ integration files with no extra config,
      // so a Rust project always has a working test command even before any test exists.
      testRunner: 'cargo-test',
      workspaces,
      entrypoints,
      confidence: 1,
      evidence: crateName ? [...evidence, `package.name = ${crateName}`] : evidence,
    };
  }

  installCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return [
      {
        command: 'cargo',
        // `fetch` downloads dependencies without compiling, so the one networked step is
        // separated from every step that follows — those then run with network denied.
        args: inspection.lockfiles.length ? ['fetch', '--locked'] : ['fetch'],
        networkPolicy: 'registry-only',
        source: 'manifest',
        purpose: 'Fetch crate dependencies',
        cwd: inspection.root,
      },
    ];
  }

  formatCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return [
      {
        command: 'cargo',
        args: ['fmt', '--check'],
        networkPolicy: 'none',
        source: 'adapter_default',
        purpose: 'Check formatting with rustfmt',
        cwd: inspection.root,
        optional: true,
      },
    ];
  }

  lintCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return [
      {
        command: 'cargo',
        args: ['clippy', '--all-targets', '--', '-D', 'warnings'],
        networkPolicy: 'none',
        source: 'adapter_default',
        purpose: 'Lint with clippy',
        cwd: inspection.root,
        // Optional because clippy is a separate rustup component and may not be installed.
        // A missing linter must not fail a build that compiles and passes its tests.
        optional: true,
      },
    ];
  }

  typecheckCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return [
      {
        command: 'cargo',
        // `check` is the type-check: it runs the full front end without codegen, which is
        // both faster than a build and exactly the analogue of `tsc --noEmit`.
        args: ['check', '--all-targets'],
        networkPolicy: 'none',
        source: 'manifest',
        purpose: 'Type-check without producing binaries',
        cwd: inspection.root,
      },
    ];
  }

  unitTestCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return [
      {
        command: 'cargo',
        args: ['test', '--all-targets'],
        networkPolicy: 'none',
        source: 'manifest',
        purpose: 'Run the Cargo test suite',
        cwd: inspection.root,
      },
    ];
  }

  buildCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return [
      {
        command: 'cargo',
        args: inspection.lockfiles.length ? ['build', '--release', '--locked'] : ['build', '--release'],
        networkPolicy: 'none',
        source: 'manifest',
        purpose: 'Build the release profile',
        cwd: inspection.root,
      },
    ];
  }

  packageCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    // Meaningless for a virtual manifest: there is no crate at the root to package.
    if (inspection.workspaces.length && !inspection.entrypoints.length) return [];
    return [
      {
        command: 'cargo',
        args: ['package', '--allow-dirty', '--no-verify'],
        networkPolicy: 'none',
        source: 'adapter_default',
        purpose: 'Verify the crate can be packaged for publication',
        cwd: inspection.root,
        optional: true,
      },
    ];
  }

  artifactLocations(inspection: ProjectInspection): readonly string[] {
    // A virtual manifest produces artefacts only under its members, so naming a root
    // artefact here would assert a file that correctly does not exist.
    if (inspection.workspaces.length && !inspection.entrypoints.length) return [];
    const hasBinary = inspection.entrypoints.some((entry) => entry.endsWith('src/main.rs'));
    const hasLibrary = inspection.entrypoints.some((entry) => entry.endsWith('src/lib.rs'));
    const artifacts: string[] = [];
    if (hasBinary) artifacts.push(joinPath(inspection.root, 'target/release/*'));
    if (hasLibrary) artifacts.push(joinPath(inspection.root, 'target/release/lib*.rlib'));
    return artifacts;
  }

  environmentRequirements(): Readonly<Record<string, string>> {
    return {
      // Full backtraces make a panicking test diagnosable from captured output alone, and
      // colour codes only corrupt logs that will be parsed.
      RUST_BACKTRACE: '1',
      CARGO_TERM_COLOR: 'never',
    };
  }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    // `error[E0308]: mismatched types` followed by ` --> src/main.rs:4:17`
    for (const match of output.matchAll(/^error(?:\[(E\d+)\])?: (.+)\n\s*--> ([^:]+):(\d+):/gm)) {
      diagnostics.push({
        kind: match[1] === 'E0433' || match[1] === 'E0432' ? 'dependency_error' : 'compile_error',
        file: match[3],
        line: Number(match[4]),
        message: match[1] ? `${match[1]}: ${match[2]}` : match[2],
        repairable: true,
      });
    }
    for (const match of output.matchAll(/^test (\S+) \.\.\. FAILED$/gm)) {
      diagnostics.push({ kind: 'test_failure', message: `Failed test: ${match[1]}`, repairable: true });
    }
    if (/no matching package named `([^`]+)`/.test(output)) {
      const name = output.match(/no matching package named `([^`]+)`/)?.[1];
      diagnostics.push({
        kind: 'dependency_error',
        message: `Crate not found on the registry: ${name}`,
        repairable: true,
      });
    }
    // The shell's actual wording is `bash: cargo: command not found` — subject first, not
    // `command not found: cargo`. The narrower pattern this replaces matched neither that
    // nor sh's variant, so a missing Cargo was reported as an unparseable failure and went
    // into the repair loop, where no source change could ever fix it.
    if (
      /error: could not find `Cargo\.toml`/.test(output) ||
      /\bcargo\b[^\n]*\bcommand not found\b/i.test(output) ||
      /\bcommand not found\b[^\n]*\bcargo\b/i.test(output) ||
      /'cargo' is not recognized/i.test(output)
    ) {
      diagnostics.push({
        kind: 'toolchain_missing',
        message: 'Cargo is not available in the sandbox image',
        repairable: false,
      });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    const hints: string[] = [];
    if (diagnostics.some((d) => d.kind === 'dependency_error')) {
      hints.push('Add the crate to [dependencies] in Cargo.toml with a real published version.');
    }
    if (diagnostics.some((d) => d.kind === 'compile_error')) {
      hints.push('Rust compile errors name the exact type expected — follow the E-code rather than adding casts.');
    }
    if (diagnostics.some((d) => d.kind === 'toolchain_missing')) {
      hints.push('Report Cargo as an unavailable toolchain — this is a sandbox image gap, not a code defect.');
    }
    return hints;
  }
}
