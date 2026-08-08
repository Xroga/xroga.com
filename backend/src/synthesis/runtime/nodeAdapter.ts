/**
 * JavaScript, TypeScript and the Node package managers.
 *
 * The ecosystem Xroga already handled, now behind the same contract as the others. That
 * reframing is the point: previously "build" meant `npm run build` everywhere in the
 * pipeline, so Node was not one ecosystem among several but the assumption the pipeline
 * was written against. Here it competes on equal terms and wins only when detected.
 *
 * The package manager is read from the lockfile rather than guessed, because the lockfile
 * is the only file that cannot lie about it. A repository can carry a `packageManager`
 * field naming pnpm while its committed `package-lock.json` proves npm resolved the tree;
 * running pnpm there produces a different dependency graph than the one that was tested.
 * Where both exist the lockfile decides, and the manifest field is recorded as evidence
 * rather than acted on.
 */

import type { ProjectFile } from '../../ai/patches.js';
import {
  dirOf,
  fileAt,
  joinPath,
  readJson,
  type ProjectInspection,
  type ParsedDiagnostic,
  type RuntimeAdapter,
  type ToolCommand,
} from './adapterContract.js';

interface PackageJson {
  name?: string;
  type?: string;
  main?: string;
  module?: string;
  bin?: unknown;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Lockfile to package manager. Ordered most specific first.
 *
 * `bun.lock` and `bun.lockb` are both listed because Bun changed format: text since 1.2,
 * binary before it. A repository can hold either and both mean Bun.
 */
const LOCKFILES: ReadonlyArray<{ file: string; manager: string }> = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'npm-shrinkwrap.json', manager: 'npm' },
  { file: 'package-lock.json', manager: 'npm' },
];

/** Install argv per manager. `npm ci` is deliberate — see `installCommands`. */
const INSTALL: Readonly<Record<string, readonly string[]>> = {
  npm: ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
  pnpm: ['install', '--ignore-scripts'],
  yarn: ['install', '--ignore-scripts'],
  bun: ['install', '--ignore-scripts'],
};

function runScript(manager: string, script: string): readonly string[] {
  // `npm` and `bun` need `run`; yarn and pnpm accept the bare script name but also accept
  // `run`, so using it everywhere keeps one shape and avoids a name colliding with a
  // built-in subcommand (a script called `add` under yarn, for instance).
  return ['run', script];
}

function detectTestRunner(pkg: PackageJson): string | null {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const candidate of ['vitest', 'jest', 'mocha', 'ava', 'tap', 'jasmine']) {
    if (deps[candidate]) return candidate;
  }
  if (pkg.scripts?.test?.includes('node --test')) return 'node:test';
  if (pkg.scripts?.test?.includes('tsx --test')) return 'node:test';
  return pkg.scripts?.test ? 'script' : null;
}

export class NodeRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'node';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Node / JavaScript / TypeScript';
  readonly languages = ['javascript', 'typescript'] as const;
  readonly runtimes = ['node', 'bun', 'deno-compat'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly manifestNames = ['package.json'] as const;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const manifest = fileAt(files, root, 'package.json');
    if (!manifest) return null;
    const pkg = readJson<PackageJson>(manifest.content);
    if (!pkg) return null;

    const evidence: string[] = [joinPath(root, 'package.json')];
    const lockfiles: string[] = [];
    let packageManager: string | null = null;

    for (const { file, manager } of LOCKFILES) {
      if (fileAt(files, root, file)) {
        lockfiles.push(joinPath(root, file));
        if (!packageManager) {
          packageManager = manager;
          evidence.push(`${joinPath(root, file)} identifies ${manager}`);
        }
      }
    }

    // The manifest's own claim is recorded but does not decide, since a lockfile is
    // evidence of what actually resolved and this field is only a declaration of intent.
    if (pkg.packageManager) {
      const declared = pkg.packageManager.split('@')[0];
      if (packageManager && declared !== packageManager) {
        evidence.push(
          `package.json declares ${declared} but ${packageManager} lockfile is committed; the lockfile decides`,
        );
      } else if (!packageManager) {
        packageManager = declared;
        evidence.push(`package.json packageManager field declares ${declared}`);
      }
    }
    if (!packageManager) {
      packageManager = 'npm';
      evidence.push('no lockfile present; defaulting to npm');
    }

    const hasTypeScript =
      Boolean(fileAt(files, root, 'tsconfig.json')) ||
      files.some((f) => f.path.startsWith(root ? `${root}/` : '') && /\.(ts|tsx|mts|cts)$/.test(f.path));
    if (fileAt(files, root, 'tsconfig.json')) evidence.push(joinPath(root, 'tsconfig.json'));

    const workspaceGlobs = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces?.packages ?? [];
    const workspaces = workspaceGlobs.length
      ? resolveWorkspaces(files, root, workspaceGlobs)
      : [];
    if (workspaces.length) {
      evidence.push(`workspaces: ${workspaces.length} member package.json files`);
    }

    const entrypoints: string[] = [];
    if (pkg.main) entrypoints.push(joinPath(root, pkg.main));
    if (pkg.module) entrypoints.push(joinPath(root, pkg.module));
    if (pkg.bin) entrypoints.push('(bin)');

    const inspection: ProjectInspection = {
      adapterId: this.id,
      root,
      languages: hasTypeScript ? ['typescript', 'javascript'] : ['javascript'],
      manifests: [joinPath(root, 'package.json')],
      lockfiles,
      packageManager,
      buildSystem: packageManager,
      testRunner: detectTestRunner(pkg),
      workspaces,
      entrypoints,
      // A package.json is unambiguous. Confidence below 1 is reserved for adapters that
      // infer an ecosystem from file extensions rather than a manifest.
      confidence: 1,
      evidence,
    };
    // Attached here rather than by the caller: every command method depends on `scripts`
    // to let the repository outrank adapter defaults, and a caller that forgot to attach
    // it would silently get guessed commands instead of the declared ones.
    INSPECTION_MANIFESTS.set(inspection, pkg);
    return inspection;
  }

  private pkg(inspection: ProjectInspection, files?: readonly ProjectFile[]): PackageJson | null {
    const stored = INSPECTION_MANIFESTS.get(inspection);
    if (stored) return stored;
    if (!files) return null;
    return readJson<PackageJson>(fileAt(files, inspection.root, 'package.json')?.content);
  }

  installCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const manager = inspection.packageManager ?? 'npm';
    // `npm ci` requires a lockfile and refuses when it disagrees with the manifest, which
    // is the behaviour worth having: a resolved tree that matches what was tested. Falling
    // back to `install` without one is not a downgrade, it is the only legal option.
    const args =
      manager === 'npm' && inspection.lockfiles.length
        ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
        : INSTALL[manager] ?? INSTALL.npm;
    return [
      {
        command: manager,
        args,
        // The one step that legitimately needs a registry. `--ignore-scripts` is not
        // optional: a generated package.json can name any dependency, and an install
        // script is arbitrary code running before anything has been reviewed.
        networkPolicy: 'registry-only',
        source: 'manifest',
        purpose: `Install dependencies with ${manager}`,
        cwd: inspection.root,
      },
    ];
  }

  private scriptCommand(
    inspection: ProjectInspection,
    script: string,
    purpose: string,
  ): ToolCommand | null {
    const pkg = this.pkg(inspection);
    if (!pkg?.scripts?.[script]) return null;
    const manager = inspection.packageManager ?? 'npm';
    return {
      command: manager,
      args: runScript(manager, script),
      networkPolicy: 'none',
      // The whole reason this ranks highest: the repository said so.
      source: 'repository_script',
      purpose: `${purpose} (${manager} run ${script})`,
      cwd: inspection.root,
    };
  }

  formatCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const script = this.scriptCommand(inspection, 'format', 'Format sources');
    return script ? [{ ...script, optional: true }] : [];
  }

  lintCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const script = this.scriptCommand(inspection, 'lint', 'Lint sources');
    return script ? [script] : [];
  }

  typecheckCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const script =
      this.scriptCommand(inspection, 'typecheck', 'Type-check') ??
      this.scriptCommand(inspection, 'type-check', 'Type-check');
    if (script) return [script];
    if (!inspection.languages.includes('typescript')) return [];
    return [
      {
        command: 'npx',
        args: ['tsc', '--noEmit'],
        networkPolicy: 'none',
        source: 'adapter_default',
        purpose: 'Type-check with tsc (no typecheck script declared)',
        cwd: inspection.root,
      },
    ];
  }

  unitTestCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const script = this.scriptCommand(inspection, 'test', 'Run tests');
    if (script) return [script];
    // No test script is a fact worth reporting rather than papering over. Inventing
    // `npx vitest` here would produce a passing run against zero tests, which §18 treats
    // as a failure — so the honest answer is no command at all.
    return [];
  }

  buildCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const script = this.scriptCommand(inspection, 'build', 'Build for production');
    return script ? [script] : [];
  }

  packageCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const pkg = this.pkg(inspection);
    if (!pkg) return [];
    const script = this.scriptCommand(inspection, 'pack', 'Create package artefact');
    if (script) return [script];
    if (pkg.name && !pkg.scripts?.build) return [];
    return [
      {
        command: inspection.packageManager ?? 'npm',
        args: ['pack', '--dry-run'],
        networkPolicy: 'none',
        source: 'adapter_default',
        purpose: 'Verify the package tarball can be assembled',
        cwd: inspection.root,
        optional: true,
      },
    ];
  }

  artifactLocations(inspection: ProjectInspection): readonly string[] {
    const pkg = this.pkg(inspection);
    const out: string[] = [];
    if (pkg?.scripts?.build) {
      // Next.js writes .next, most bundlers write dist or build. Listing candidates rather
      // than asserting one keeps this from failing a project that chose differently.
      out.push(
        joinPath(inspection.root, 'dist/**'),
        joinPath(inspection.root, 'build/**'),
        joinPath(inspection.root, '.next/**'),
      );
    }
    return out;
  }

  environmentRequirements(): Readonly<Record<string, string>> {
    return { NODE_ENV: 'production', CI: '1' };
  }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    // tsc: `path(line,col): error TS2304: message`
    for (const match of output.matchAll(/^(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)$/gm)) {
      diagnostics.push({
        kind: 'type_error',
        file: match[1],
        line: Number(match[2]),
        message: match[3].trim(),
        repairable: true,
      });
    }
    // node/npm: a missing module is a dependency problem, not a code problem, and the
    // repair for it is different — add the dependency rather than edit the source.
    for (const match of output.matchAll(/Cannot find module ['"]([^'"]+)['"]/g)) {
      diagnostics.push({
        kind: 'dependency_error',
        message: `Missing module: ${match[1]}`,
        repairable: true,
      });
    }
    if (/ERR_PNPM_NO_LOCKFILE|npm ERR! code EUSAGE/.test(output)) {
      diagnostics.push({
        kind: 'dependency_error',
        message: 'Lockfile is missing or disagrees with package.json',
        repairable: true,
      });
    }
    if (/command not found|is not recognized as an internal/.test(output)) {
      diagnostics.push({
        kind: 'toolchain_missing',
        message: 'A required Node toolchain binary is not installed in the sandbox',
        // Not repairable by editing code: the environment is wrong, not the source.
        repairable: false,
      });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    const hints: string[] = [];
    if (diagnostics.some((d) => d.kind === 'dependency_error')) {
      hints.push('Add the missing dependency to package.json rather than stubbing the import.');
    }
    if (diagnostics.some((d) => d.kind === 'type_error')) {
      hints.push('Fix the type at its declaration; do not silence it with `any` or @ts-ignore.');
    }
    if (diagnostics.some((d) => d.kind === 'toolchain_missing')) {
      hints.push('Report the missing toolchain as a blocker — no source change can fix it.');
    }
    return hints;
  }
}

/**
 * Manifests kept beside their inspection.
 *
 * Command methods take a `ProjectInspection` rather than the file list, so the manifest
 * has to travel with it somehow. A WeakMap keeps `ProjectInspection` a plain serialisable
 * record — it goes into persisted execution state — while letting the adapter recover the
 * parsed manifest without re-reading the tree. Entries vanish with the inspection.
 */
const INSPECTION_MANIFESTS = new WeakMap<ProjectInspection, PackageJson>();

/**
 * Re-attaches the manifest to an inspection that has been through storage.
 *
 * `detect` attaches it in memory, but execution state is persisted and reloaded across
 * restarts, and a `ProjectInspection` revived from JSON is a different object with no
 * WeakMap entry. Without this, a resumed run would fall back to adapter defaults and
 * quietly stop honouring the repository's own scripts — the one behaviour this adapter
 * exists to guarantee.
 */
export function rememberNodeManifest(
  inspection: ProjectInspection,
  files: readonly ProjectFile[],
): ProjectInspection {
  const pkg = readJson<PackageJson>(fileAt(files, inspection.root, 'package.json')?.content);
  if (pkg) INSPECTION_MANIFESTS.set(inspection, pkg);
  return inspection;
}

/**
 * Expands workspace globs against the files actually present.
 *
 * Only the trailing `*` form is handled, because `packages/*` and `apps/*` cover nearly
 * every real repository and a full glob engine here would be unearned complexity. A
 * pattern this cannot expand yields no members rather than a wrong list.
 */
function resolveWorkspaces(
  files: readonly ProjectFile[],
  root: string,
  globs: readonly string[],
): string[] {
  const members = new Set<string>();
  for (const glob of globs) {
    const prefix = glob.endsWith('/*') ? glob.slice(0, -2) : glob.endsWith('*') ? glob.slice(0, -1) : glob;
    const base = joinPath(root, prefix).replace(/\/+$/, '');
    for (const file of files) {
      if (!file.path.endsWith('/package.json')) continue;
      const dir = dirOf(file.path);
      if (dir === root) continue;
      if (base === '' || dir === base || dir.startsWith(`${base}/`)) members.add(dir);
    }
  }
  return [...members].sort();
}
