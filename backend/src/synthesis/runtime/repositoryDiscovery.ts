/**
 * Recognising ecosystems that have no adapter yet.
 *
 * There are three adapters and far more than three ecosystems. The gap between them is
 * where a system either stays honest or starts lying: a Gradle repository with no JVM
 * adapter must come back as "this is Gradle, and nothing here can build it", never as
 * "no known project structure" — because the second reads as *there is nothing here*,
 * which is how a Java service ends up regenerated as a static website.
 *
 * So detection and capability are deliberately separate questions. This module answers
 * only the first. It says what a repository *is*; whether Xroga can build it is decided
 * later by whether an adapter claims the ecosystem.
 *
 * The marker table below is not a whitelist, and §8 is explicit about that. It is a fast
 * path for shapes worth naming precisely. Anything it misses still produces evidence
 * through `genericSignals` — shebangs, file extensions, Makefile targets, CI workflows and
 * container definitions — which is what §12's discovery consumes. A repository nobody
 * anticipated yields a weaker answer here, not silence.
 */

import type { ProjectFile } from '../../ai/patches.js';
import { dirOf } from './adapterContract.js';

/** How strongly a marker identifies its ecosystem. */
export type SignalStrength = 'definitive' | 'strong' | 'weak';

export interface EcosystemSignal {
  readonly ecosystem: string;
  readonly displayName: string;
  /** The adapter that would own this, when one exists. */
  readonly adapterId: string | null;
  readonly packageManager: string | null;
  readonly buildSystem: string | null;
  readonly root: string;
  readonly markers: readonly string[];
  readonly strength: SignalStrength;
}

interface Marker {
  /** Exact basename, or a predicate for extension families like `*.csproj`. */
  readonly file?: string;
  readonly matches?: (basename: string) => boolean;
  readonly ecosystem: string;
  readonly displayName: string;
  readonly adapterId: string | null;
  readonly packageManager: string | null;
  readonly buildSystem: string | null;
  readonly strength: SignalStrength;
}

const m = (
  file: string,
  ecosystem: string,
  displayName: string,
  adapterId: string | null,
  packageManager: string | null,
  buildSystem: string | null,
  strength: SignalStrength = 'definitive',
): Marker => ({ file, ecosystem, displayName, adapterId, packageManager, buildSystem, strength });

/**
 * Ecosystem markers, from §8.
 *
 * `adapterId` is the honest column. A null means the ecosystem is *recognised* and not
 * *buildable* — Xroga knows what a `pom.xml` is and cannot currently run Maven. Keeping
 * that distinction in the data rather than in prose is what lets the planner report a
 * specific blocker instead of a generic refusal.
 */
const MARKERS: readonly Marker[] = [
  // Adapters exist for these three.
  m('package.json', 'node', 'Node / JavaScript / TypeScript', 'node', null, null),
  m('pyproject.toml', 'python', 'Python', 'python', null, null),
  m('requirements.txt', 'python', 'Python', 'python', 'pip', null, 'strong'),
  m('setup.py', 'python', 'Python', 'python', 'pip', 'setuptools', 'strong'),
  m('Pipfile', 'python', 'Python', 'python', 'pipenv', null),
  m('Cargo.toml', 'rust', 'Rust', 'rust', 'cargo', 'cargo'),

  // Recognised, no adapter yet.
  m('go.mod', 'go', 'Go', null, 'go-modules', 'go'),
  m('go.work', 'go', 'Go workspace', null, 'go-modules', 'go'),
  m('pom.xml', 'jvm', 'Java / Maven', null, 'maven', 'maven'),
  m('build.gradle', 'jvm', 'JVM / Gradle', null, 'gradle', 'gradle'),
  m('build.gradle.kts', 'jvm', 'Kotlin / Gradle', null, 'gradle', 'gradle'),
  m('settings.gradle', 'jvm', 'JVM / Gradle multi-project', null, 'gradle', 'gradle'),
  m('settings.gradle.kts', 'jvm', 'JVM / Gradle multi-project', null, 'gradle', 'gradle'),
  m('build.sbt', 'scala', 'Scala / sbt', null, 'sbt', 'sbt'),
  m('global.json', 'dotnet', '.NET', null, 'nuget', 'dotnet', 'strong'),
  m('composer.json', 'php', 'PHP / Composer', null, 'composer', null),
  m('Gemfile', 'ruby', 'Ruby / Bundler', null, 'bundler', null),
  m('pubspec.yaml', 'dart', 'Dart / Flutter', null, 'pub', 'flutter'),
  m('Package.swift', 'swift', 'Swift Package Manager', null, 'swiftpm', 'swiftpm'),
  m('mix.exs', 'elixir', 'Elixir / Mix', null, 'hex', 'mix'),
  m('rebar.config', 'erlang', 'Erlang / Rebar', null, 'hex', 'rebar3'),
  m('build.zig', 'zig', 'Zig', null, 'zig', 'zig'),
  m('CMakeLists.txt', 'cpp', 'C / C++ (CMake)', null, null, 'cmake'),
  m('meson.build', 'cpp', 'C / C++ (Meson)', null, null, 'meson'),
  m('conanfile.txt', 'cpp', 'C / C++ (Conan)', null, 'conan', null, 'strong'),
  m('vcpkg.json', 'cpp', 'C / C++ (vcpkg)', null, 'vcpkg', null, 'strong'),
  m('DESCRIPTION', 'r', 'R package', null, null, null, 'weak'),
  m('renv.lock', 'r', 'R (renv)', null, 'renv', null),
  m('Project.toml', 'julia', 'Julia', null, 'pkg', null, 'strong'),

  // Web3.
  m('foundry.toml', 'solidity', 'Solidity / Foundry', null, 'forge', 'forge'),
  m('hardhat.config.js', 'solidity', 'Solidity / Hardhat', null, 'npm', 'hardhat'),
  m('hardhat.config.ts', 'solidity', 'Solidity / Hardhat', null, 'npm', 'hardhat'),
  m('Anchor.toml', 'solana', 'Solana / Anchor', null, 'cargo', 'anchor'),
  m('Move.toml', 'move', 'Move', null, null, 'move', 'strong'),

  // Infrastructure.
  m('Chart.yaml', 'helm', 'Helm chart', null, null, 'helm'),
  m('kustomization.yaml', 'kubernetes', 'Kubernetes (Kustomize)', null, null, 'kustomize'),
  m('terragrunt.hcl', 'terraform', 'Terragrunt', null, null, 'terragrunt'),
  m('serverless.yml', 'serverless', 'Serverless Framework', null, null, 'serverless'),

  // Platforms.
  m('manifest.json', 'browser_extension', 'Browser extension', null, null, null, 'weak'),
  m('tauri.conf.json', 'tauri', 'Tauri desktop', null, null, 'tauri'),
  m('project.godot', 'godot', 'Godot game', null, null, 'godot'),
];

/** Extension-family markers, which cannot be matched by basename equality. */
const PATTERN_MARKERS: readonly Marker[] = [
  { matches: (b) => b.endsWith('.csproj'), ecosystem: 'dotnet', displayName: 'C# / .NET', adapterId: null, packageManager: 'nuget', buildSystem: 'dotnet', strength: 'definitive' },
  { matches: (b) => b.endsWith('.fsproj'), ecosystem: 'dotnet', displayName: 'F# / .NET', adapterId: null, packageManager: 'nuget', buildSystem: 'dotnet', strength: 'definitive' },
  { matches: (b) => b.endsWith('.sln'), ecosystem: 'dotnet', displayName: '.NET solution', adapterId: null, packageManager: 'nuget', buildSystem: 'dotnet', strength: 'strong' },
  { matches: (b) => b.endsWith('.gemspec'), ecosystem: 'ruby', displayName: 'Ruby gem', adapterId: null, packageManager: 'bundler', buildSystem: 'gem', strength: 'definitive' },
  { matches: (b) => b.endsWith('.tf'), ecosystem: 'terraform', displayName: 'Terraform', adapterId: null, packageManager: null, buildSystem: 'terraform', strength: 'strong' },
  { matches: (b) => /^Pulumi\.ya?ml$/.test(b), ecosystem: 'pulumi', displayName: 'Pulumi', adapterId: null, packageManager: null, buildSystem: 'pulumi', strength: 'definitive' },
  { matches: (b) => b.endsWith('.podspec'), ecosystem: 'swift', displayName: 'CocoaPods', adapterId: null, packageManager: 'cocoapods', buildSystem: null, strength: 'strong' },
  { matches: (b) => /^(Dockerfile|Containerfile)(\..+)?$/.test(b), ecosystem: 'container', displayName: 'Container image', adapterId: null, packageManager: null, buildSystem: 'docker', strength: 'strong' },
  { matches: (b) => /^(docker-)?compose\.ya?ml$/.test(b), ecosystem: 'container', displayName: 'Compose stack', adapterId: null, packageManager: null, buildSystem: 'compose', strength: 'strong' },
  { matches: (b) => b.endsWith('.rockspec'), ecosystem: 'lua', displayName: 'Lua rock', adapterId: null, packageManager: 'luarocks', buildSystem: null, strength: 'definitive' },
];

function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

/**
 * Every ecosystem present, with the directory that owns it.
 *
 * Signals are per directory rather than per repository, because a tree can hold Terraform
 * under `infra/` and Go under `cmd/` and neither describes the whole.
 */
export function detectEcosystems(files: readonly ProjectFile[]): readonly EcosystemSignal[] {
  const found = new Map<string, EcosystemSignal>();

  const record = (marker: Marker, path: string) => {
    const root = dirOf(path);
    const key = `${marker.ecosystem}::${root}`;
    const existing = found.get(key);
    if (existing) {
      // Several markers for one ecosystem in one directory reinforce each other rather
      // than competing — `pom.xml` beside `settings.gradle` is still the JVM.
      found.set(key, { ...existing, markers: [...existing.markers, path] });
      return;
    }
    found.set(key, {
      ecosystem: marker.ecosystem,
      displayName: marker.displayName,
      adapterId: marker.adapterId,
      packageManager: marker.packageManager,
      buildSystem: marker.buildSystem,
      root,
      markers: [path],
      strength: marker.strength,
    });
  };

  for (const file of files) {
    const base = basename(file.path);
    for (const marker of MARKERS) if (marker.file === base) record(marker, file.path);
    for (const marker of PATTERN_MARKERS) if (marker.matches?.(base)) record(marker, file.path);
  }

  return [...found.values()].sort(
    (a, b) => a.root.localeCompare(b.root) || a.ecosystem.localeCompare(b.ecosystem),
  );
}

/** Ecosystems present that no adapter can build. The blocker list, stated precisely. */
export function unsupportedEcosystems(
  signals: readonly EcosystemSignal[],
): readonly EcosystemSignal[] {
  return signals.filter((signal) => signal.adapterId === null);
}

export interface MonorepoLayout {
  readonly kind: string;
  readonly root: string;
  readonly evidence: string;
}

/**
 * Monorepo tooling, from §29.
 *
 * Worth detecting separately from ecosystems because the tool changes which commands are
 * correct, not just which language is present: an Nx repository builds through
 * `nx affected`, and running a package's own script directly bypasses the dependency graph
 * that makes the result correct.
 */
export function detectMonorepoLayouts(files: readonly ProjectFile[]): readonly MonorepoLayout[] {
  const layouts: MonorepoLayout[] = [];
  const push = (kind: string, path: string, evidence: string) =>
    layouts.push({ kind, root: dirOf(path), evidence });

  for (const file of files) {
    const base = basename(file.path);
    if (base === 'nx.json') push('nx', file.path, 'nx.json');
    else if (base === 'turbo.json') push('turborepo', file.path, 'turbo.json');
    else if (base === 'pnpm-workspace.yaml') push('pnpm-workspaces', file.path, 'pnpm-workspace.yaml');
    else if (base === 'lerna.json') push('lerna', file.path, 'lerna.json');
    else if (base === 'go.work') push('go-workspace', file.path, 'go.work');
    else if (base === 'WORKSPACE' || base === 'WORKSPACE.bazel' || base === 'MODULE.bazel') {
      push('bazel', file.path, base);
    } else if (base === 'Cargo.toml' && /^\s*\[\s*workspace\s*\]/m.test(file.content)) {
      push('cargo-workspace', file.path, 'Cargo.toml [workspace]');
    } else if (base === 'package.json') {
      try {
        const pkg = JSON.parse(file.content) as { workspaces?: unknown };
        if (pkg.workspaces) push('npm-workspaces', file.path, 'package.json workspaces');
      } catch {
        // A malformed manifest is not a monorepo signal. Other detectors still see it.
      }
    }
  }
  return layouts;
}

export interface GenericSignal {
  readonly kind: 'shebang' | 'extension' | 'make_target' | 'ci_workflow' | 'container' | 'documentation';
  readonly detail: string;
  readonly path: string;
  /** A command this evidence suggests, when it names one outright. */
  readonly suggestedCommand?: string;
}

const EXTENSION_LANGUAGES: Readonly<Record<string, string>> = {
  go: 'go', java: 'java', kt: 'kotlin', cs: 'csharp', fs: 'fsharp', rb: 'ruby',
  php: 'php', swift: 'swift', dart: 'dart', ex: 'elixir', exs: 'elixir', erl: 'erlang',
  zig: 'zig', scala: 'scala', jl: 'julia', lua: 'lua', r: 'r', c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', hpp: 'cpp', m: 'objective-c', sol: 'solidity', tf: 'terraform',
  sh: 'shell', ps1: 'powershell', pl: 'perl', hs: 'haskell', ml: 'ocaml', nim: 'nim',
  cr: 'crystal', v: 'vlang', clj: 'clojure', groovy: 'groovy', vue: 'vue', svelte: 'svelte',
};

/**
 * Evidence for a repository no marker recognised.
 *
 * This is the honest floor beneath the marker table, and the reason §8 can say the list is
 * not a whitelist. A CI workflow is the strongest thing here by some distance: it is a
 * maintained, executable statement of how the project is really built, which beats any
 * inference from file extensions. §12 consumes these in roughly this order.
 */
export function genericSignals(files: readonly ProjectFile[]): readonly GenericSignal[] {
  const signals: GenericSignal[] = [];
  const languageCounts = new Map<string, { count: number; sample: string }>();

  for (const file of files) {
    const base = basename(file.path);
    const extension = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
    const language = EXTENSION_LANGUAGES[extension];
    if (language) {
      const entry = languageCounts.get(language) ?? { count: 0, sample: file.path };
      languageCounts.set(language, { count: entry.count + 1, sample: entry.sample });
    }

    // A shebang states the interpreter outright — stronger than any extension guess.
    const firstLine = file.content.slice(0, 200).split('\n')[0] ?? '';
    if (firstLine.startsWith('#!')) {
      signals.push({
        kind: 'shebang',
        detail: firstLine.trim(),
        path: file.path,
        suggestedCommand: firstLine.replace(/^#!\s*(?:\/usr\/bin\/env\s+)?/, '').trim(),
      });
    }

    if (base === 'Makefile' || base === 'makefile' || base === 'GNUmakefile') {
      for (const match of file.content.matchAll(/^([a-zA-Z][\w.-]*)\s*:(?!=)/gm)) {
        signals.push({
          kind: 'make_target',
          detail: match[1],
          path: file.path,
          suggestedCommand: `make ${match[1]}`,
        });
      }
    }

    if (/^\.github\/workflows\/.+\.ya?ml$/.test(file.path)) {
      // `run:` steps are what the project actually executes on every push.
      for (const match of file.content.matchAll(/^\s*(?:-\s*)?run:\s*(?:\||>)?\s*(.+)$/gm)) {
        const command = match[1].trim();
        if (command && !command.startsWith('#')) {
          signals.push({ kind: 'ci_workflow', detail: command, path: file.path, suggestedCommand: command });
        }
      }
    }

    if (/^(Dockerfile|Containerfile)/.test(base)) {
      for (const match of file.content.matchAll(/^\s*RUN\s+(.+)$/gm)) {
        signals.push({ kind: 'container', detail: match[1].trim(), path: file.path, suggestedCommand: match[1].trim() });
      }
    }

    if (/^(README|BUILD|CONTRIBUTING|INSTALL)(\.md|\.rst|\.txt)?$/i.test(base)) {
      // Fenced blocks in a README are the documented way to build, when there is one.
      for (const match of file.content.matchAll(/```(?:sh|bash|shell|console)?\n([\s\S]*?)```/g)) {
        for (const line of match[1].split('\n')) {
          const command = line.replace(/^\s*[$#]\s*/, '').trim();
          if (command && !command.startsWith('#') && command.length < 200) {
            signals.push({ kind: 'documentation', detail: command, path: file.path, suggestedCommand: command });
          }
        }
      }
    }
  }

  for (const [language, { count, sample }] of languageCounts) {
    signals.push({ kind: 'extension', detail: `${count} ${language} source file(s)`, path: sample });
  }

  return signals;
}

export interface RepositoryDiscovery {
  readonly ecosystems: readonly EcosystemSignal[];
  readonly unsupported: readonly EcosystemSignal[];
  readonly monorepo: readonly MonorepoLayout[];
  readonly generic: readonly GenericSignal[];
  /** True when something is present but no adapter can act on it. */
  readonly needsRuntimeDiscovery: boolean;
}

/**
 * Everything discoverable about a repository, before any adapter claims it.
 *
 * `needsRuntimeDiscovery` is the trigger for §12. It is true when a repository holds real
 * content that no adapter can build — which is a question worth asking of an empty
 * repository too, where the answer is correctly false: there is nothing to discover.
 */
export function discoverRepository(files: readonly ProjectFile[]): RepositoryDiscovery {
  const ecosystems = detectEcosystems(files);
  const unsupported = unsupportedEcosystems(ecosystems);
  const supported = ecosystems.filter((signal) => signal.adapterId !== null);
  const generic = genericSignals(files);

  return {
    ecosystems,
    unsupported,
    monorepo: detectMonorepoLayouts(files),
    generic,
    needsRuntimeDiscovery:
      files.length > 0 && supported.length === 0 && (unsupported.length > 0 || generic.length > 0),
  };
}
