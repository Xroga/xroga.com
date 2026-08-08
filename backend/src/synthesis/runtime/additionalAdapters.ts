/**
 * Seven more ecosystems, added the way the contract intended.
 *
 * The point of this file is what is *not* in it: no change to the planner, the flow, the
 * registry logic or the pipeline. Each adapter is a class implementing `RuntimeAdapter`,
 * registered at the bottom. If adding Go had required touching anything above this layer,
 * the architecture would not have worked and §11 would be a claim rather than a fact.
 *
 * These are accelerators, not a whitelist. Generic runtime discovery still handles
 * anything unmatched — a repository in a language nobody has written an adapter for is
 * still buildable, and that remains true after this file as before it.
 *
 * Capability states are honest per ecosystem. Go is `implementation_available` because its
 * commands are unambiguous and the toolchain is compact enough to verify; C/C++ is
 * `detected` because "how does this build" genuinely has several answers and pretending
 * otherwise produces confident nonsense. None of them claims `sandbox_verified` until
 * something has actually run in the sandbox image.
 */

import type { ProjectFile } from '../../ai/patches.js';
import {
  fileAt,
  joinPath,
  readJson,
  tomlSection,
  type ParsedDiagnostic,
  type ProjectInspection,
  type RuntimeAdapter,
  type ToolCommand,
} from './adapterContract.js';
import { registerRuntimeAdapter } from './registry.js';

/** Shared shape: a command with no network, in the component's directory. */
const cmd = (
  command: string,
  args: readonly string[],
  purpose: string,
  cwd: string,
  options: { network?: 'none' | 'registry-only'; optional?: boolean; source?: ToolCommand['source'] } = {},
): ToolCommand => ({
  command,
  args,
  networkPolicy: options.network ?? 'none',
  source: options.source ?? 'manifest',
  purpose,
  cwd,
  ...(options.optional ? { optional: true } : {}),
});

const anyFileMatching = (
  files: readonly ProjectFile[],
  root: string,
  predicate: (basename: string) => boolean,
): string | null => {
  const prefix = root ? `${root}/` : '';
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    // Only the component's own directory, not nested ones.
    if (rest.includes('/')) continue;
    if (predicate(rest)) return file.path;
  }
  return null;
};

const toolchainMissing = (output: string, binary: string): boolean =>
  new RegExp(`\\b${binary}\\b[^\\n]*\\bcommand not found\\b`, 'i').test(output) ||
  new RegExp(`\\bcommand not found\\b[^\\n]*\\b${binary}\\b`, 'i').test(output) ||
  new RegExp(`'${binary}' is not recognized`, 'i').test(output) ||
  new RegExp(`\\b${binary}\\b:\\s*not found`, 'i').test(output);

// ─────────────────────────────────────────────────────────────────────────────
// Go
// ─────────────────────────────────────────────────────────────────────────────

export class GoRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'go';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Go';
  readonly languages = ['go'] as const;
  readonly runtimes = ['go'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly sandboxImage = 'registry-1.docker.io/library/golang:1-alpine';
  readonly manifestNames = ['go.mod', 'go.work'] as const;
  /** `go test ./...` from the module root already covers every package beneath it. */
  readonly rootCommandCoversWorkspace = true;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const module = fileAt(files, root, 'go.mod');
    const workspace = fileAt(files, root, 'go.work');
    if (!module && !workspace) return null;

    const evidence: string[] = [];
    const lockfiles: string[] = [];
    if (module) evidence.push(joinPath(root, 'go.mod'));
    if (fileAt(files, root, 'go.sum')) lockfiles.push(joinPath(root, 'go.sum'));
    if (workspace) evidence.push('go.work declares a multi-module workspace');

    const prefix = root ? `${root}/` : '';
    const hasMain = files.some(
      (file) => file.path.startsWith(prefix) && file.path.endsWith('.go') && /^\s*package\s+main\b/m.test(file.content),
    );
    if (hasMain) evidence.push('package main declares a binary');

    const members: string[] = [];
    if (workspace) {
      for (const file of files) {
        if (!file.path.endsWith('/go.mod')) continue;
        const dir = file.path.slice(0, -'/go.mod'.length);
        if (dir !== root && dir.startsWith(prefix)) members.push(dir);
      }
      members.sort();
    }

    return {
      adapterId: this.id, root, languages: ['go'],
      manifests: [module ? joinPath(root, 'go.mod') : joinPath(root, 'go.work')],
      lockfiles, packageManager: 'go-modules', buildSystem: 'go',
      testRunner: 'go-test', workspaces: members,
      entrypoints: hasMain ? ['package main'] : [],
      confidence: 1, evidence,
    };
  }

  installCommands(i: ProjectInspection) { return [cmd('go', ['mod', 'download'], 'Download module dependencies', i.root, { network: 'registry-only' })]; }
  formatCommands(i: ProjectInspection) { return [cmd('gofmt', ['-l', '.'], 'Check formatting', i.root, { optional: true, source: 'adapter_default' })]; }
  // `go vet` is a correctness check shipped with the toolchain, not a style linter, so it
  // is not optional the way an external linter would be.
  lintCommands(i: ProjectInspection) { return [cmd('go', ['vet', './...'], 'Vet for suspicious constructs', i.root)]; }
  // Go has no separate type-check step; `go build` is the compiler front end.
  typecheckCommands(i: ProjectInspection) { return [cmd('go', ['build', './...'], 'Compile without producing binaries', i.root)]; }
  unitTestCommands(i: ProjectInspection) { return [cmd('go', ['test', './...'], 'Run the Go test suite', i.root)]; }
  buildCommands(i: ProjectInspection) {
    return i.entrypoints.length
      ? [cmd('go', ['build', '-o', 'bin/app', './...'], 'Build the binary', i.root)]
      : [cmd('go', ['build', './...'], 'Compile all packages', i.root)];
  }
  packageCommands() { return []; }
  artifactLocations(i: ProjectInspection) { return i.entrypoints.length ? [joinPath(i.root, 'bin/app')] : []; }
  environmentRequirements() { return { CGO_ENABLED: '0', GOFLAGS: '-mod=mod' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    // `./main.go:12:5: undefined: foo`
    for (const match of output.matchAll(/^(.+?\.go):(\d+):\d+:\s*(.+)$/gm)) {
      diagnostics.push({ kind: 'compile_error', file: match[1].replace(/^\.\//, ''), line: Number(match[2]), message: match[3].trim(), repairable: true });
    }
    for (const match of output.matchAll(/^--- FAIL: (\S+)/gm)) {
      diagnostics.push({ kind: 'test_failure', message: `Failed test: ${match[1]}`, repairable: true });
    }
    if (/no required module provides package|missing go\.sum entry/.test(output)) {
      diagnostics.push({ kind: 'dependency_error', message: 'A required module is not declared in go.mod', repairable: true });
    }
    if (toolchainMissing(output, 'go')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'The Go toolchain is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    const hints: string[] = [];
    if (diagnostics.some((d) => d.kind === 'dependency_error')) hints.push('Run go mod tidy semantics: declare the module in go.mod rather than stubbing the import.');
    if (diagnostics.some((d) => d.kind === 'compile_error')) hints.push('Go compile errors name the exact identifier; unused imports and variables are errors, not warnings.');
    if (diagnostics.some((d) => d.kind === 'toolchain_missing')) hints.push('Report Go as an unavailable toolchain — no source change can fix it.');
    return hints;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JVM — Maven and Gradle
// ─────────────────────────────────────────────────────────────────────────────

export class JvmRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'jvm';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Java / Kotlin (Maven or Gradle)';
  readonly languages = ['java', 'kotlin', 'scala'] as const;
  readonly runtimes = ['jvm'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly sandboxImage = 'registry-1.docker.io/library/eclipse-temurin:21-jdk-alpine';
  readonly manifestNames = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'] as const;
  readonly rootCommandCoversWorkspace = true;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const pom = fileAt(files, root, 'pom.xml');
    const gradle = fileAt(files, root, 'build.gradle') ?? fileAt(files, root, 'build.gradle.kts');
    const settings = fileAt(files, root, 'settings.gradle') ?? fileAt(files, root, 'settings.gradle.kts');
    if (!pom && !gradle && !settings) return null;

    const evidence: string[] = [];
    // The wrapper pins the build tool version the project was tested with. Using a system
    // Gradle instead silently changes the toolchain, so its presence decides the command.
    const wrapper = Boolean(fileAt(files, root, 'gradlew'));
    const buildSystem = pom ? 'maven' : 'gradle';
    if (pom) evidence.push(joinPath(root, 'pom.xml'));
    if (gradle) evidence.push(gradle.path);
    if (wrapper) evidence.push('gradlew is committed; the wrapper pins the tested Gradle version and takes precedence');

    const languages: string[] = [];
    const prefix = root ? `${root}/` : '';
    if (files.some((f) => f.path.startsWith(prefix) && f.path.endsWith('.kt'))) languages.push('kotlin');
    if (files.some((f) => f.path.startsWith(prefix) && f.path.endsWith('.java'))) languages.push('java');
    if (files.some((f) => f.path.startsWith(prefix) && f.path.endsWith('.scala'))) languages.push('scala');

    const modules: string[] = [];
    if (settings || pom?.content.includes('<modules>')) {
      for (const file of files) {
        const isModule = file.path.endsWith('/pom.xml') || file.path.endsWith('/build.gradle') || file.path.endsWith('/build.gradle.kts');
        if (!isModule) continue;
        const dir = file.path.slice(0, file.path.lastIndexOf('/'));
        if (dir !== root && dir.startsWith(prefix)) modules.push(dir);
      }
      modules.sort();
      if (modules.length) evidence.push(`${modules.length} submodule(s) detected`);
    }

    return {
      adapterId: this.id, root, languages: languages.length ? languages : ['java'],
      manifests: [pom?.path ?? gradle?.path ?? settings!.path],
      lockfiles: [], packageManager: buildSystem, buildSystem,
      testRunner: buildSystem, workspaces: modules, entrypoints: [],
      confidence: 1,
      evidence: wrapper ? [...evidence, 'wrapper:true'] : evidence,
    };
  }

  private gradle(i: ProjectInspection): string {
    return i.evidence.includes('wrapper:true') ? './gradlew' : 'gradle';
  }

  installCommands(i: ProjectInspection) {
    return i.buildSystem === 'maven'
      ? [cmd('mvn', ['-B', 'dependency:go-offline'], 'Resolve Maven dependencies', i.root, { network: 'registry-only' })]
      : [cmd(this.gradle(i), ['--no-daemon', 'dependencies'], 'Resolve Gradle dependencies', i.root, { network: 'registry-only' })];
  }
  formatCommands() { return []; }
  lintCommands() { return []; }
  typecheckCommands(i: ProjectInspection) {
    return i.buildSystem === 'maven'
      ? [cmd('mvn', ['-B', '-q', 'compile'], 'Compile sources', i.root)]
      : [cmd(this.gradle(i), ['--no-daemon', 'compileJava'], 'Compile sources', i.root, { optional: true })];
  }
  unitTestCommands(i: ProjectInspection) {
    return i.buildSystem === 'maven'
      ? [cmd('mvn', ['-B', 'test'], 'Run the Maven test suite', i.root)]
      : [cmd(this.gradle(i), ['--no-daemon', 'test'], 'Run the Gradle test suite', i.root)];
  }
  buildCommands(i: ProjectInspection) {
    return i.buildSystem === 'maven'
      ? [cmd('mvn', ['-B', '-DskipTests', 'package'], 'Package the artefact', i.root)]
      : [cmd(this.gradle(i), ['--no-daemon', 'build', '-x', 'test'], 'Build the artefact', i.root)];
  }
  packageCommands(i: ProjectInspection) { return this.buildCommands(i); }
  artifactLocations(i: ProjectInspection) {
    return i.buildSystem === 'maven' ? [joinPath(i.root, 'target/*.jar')] : [joinPath(i.root, 'build/libs/*.jar')];
  }
  environmentRequirements() { return { MAVEN_OPTS: '-Dstyle.color=never', GRADLE_OPTS: '-Dorg.gradle.console=plain' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/^\[ERROR\]\s+(.+?\.(?:java|kt)):\[(\d+),\d+\]\s*(.+)$/gm)) {
      diagnostics.push({ kind: 'compile_error', file: match[1], line: Number(match[2]), message: match[3].trim(), repairable: true });
    }
    for (const match of output.matchAll(/^(.+?\.(?:java|kt)):(\d+):\s*error:\s*(.+)$/gm)) {
      diagnostics.push({ kind: 'compile_error', file: match[1], line: Number(match[2]), message: match[3].trim(), repairable: true });
    }
    if (/Tests run:.*Failures: [1-9]|FAILED\b|There were failing tests/.test(output)) {
      diagnostics.push({ kind: 'test_failure', message: 'One or more JVM tests failed', repairable: true });
    }
    if (/Could not resolve|Could not find artifact|dependency .* not found/i.test(output)) {
      diagnostics.push({ kind: 'dependency_error', message: 'A declared dependency could not be resolved', repairable: true });
    }
    if (toolchainMissing(output, 'mvn') || toolchainMissing(output, 'gradle') || toolchainMissing(output, 'java')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'The JVM build toolchain is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    const hints: string[] = [];
    if (diagnostics.some((d) => d.kind === 'dependency_error')) hints.push('Declare the dependency with a real published coordinate in pom.xml or build.gradle.');
    if (diagnostics.some((d) => d.kind === 'toolchain_missing')) hints.push('Report the JVM toolchain as unavailable — no source change can fix it.');
    return hints;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// .NET
// ─────────────────────────────────────────────────────────────────────────────

export class DotnetRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'dotnet';
  readonly adapterVersion = '1.0.0';
  readonly displayName = '.NET (C# / F#)';
  readonly languages = ['csharp', 'fsharp'] as const;
  readonly runtimes = ['dotnet'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly sandboxImage = 'mcr.microsoft.com/dotnet/sdk:9.0-alpine';
  readonly manifestNames = ['global.json'] as const;
  readonly rootCommandCoversWorkspace = true;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const solution = anyFileMatching(files, root, (base) => base.endsWith('.sln'));
    const project = anyFileMatching(files, root, (base) => base.endsWith('.csproj') || base.endsWith('.fsproj'));
    const global = fileAt(files, root, 'global.json');
    if (!solution && !project && !global) return null;

    const evidence = [solution, project, global?.path].filter(Boolean) as string[];
    const prefix = root ? `${root}/` : '';
    const languages: string[] = [];
    if (files.some((f) => f.path.startsWith(prefix) && f.path.endsWith('.cs'))) languages.push('csharp');
    if (files.some((f) => f.path.startsWith(prefix) && f.path.endsWith('.fs'))) languages.push('fsharp');

    const projects: string[] = [];
    if (solution) {
      for (const file of files) {
        if (!/\.(cs|fs)proj$/.test(file.path)) continue;
        const dir = file.path.slice(0, file.path.lastIndexOf('/'));
        if (dir !== root && dir.startsWith(prefix)) projects.push(dir);
      }
      projects.sort();
    }

    return {
      adapterId: this.id, root, languages: languages.length ? languages : ['csharp'],
      manifests: [solution ?? project ?? global!.path], lockfiles: [],
      packageManager: 'nuget', buildSystem: 'dotnet', testRunner: 'dotnet-test',
      workspaces: projects, entrypoints: [], confidence: 1, evidence,
    };
  }

  installCommands(i: ProjectInspection) { return [cmd('dotnet', ['restore'], 'Restore NuGet packages', i.root, { network: 'registry-only' })]; }
  formatCommands(i: ProjectInspection) { return [cmd('dotnet', ['format', '--verify-no-changes'], 'Check formatting', i.root, { optional: true, source: 'adapter_default' })]; }
  lintCommands() { return []; }
  typecheckCommands(i: ProjectInspection) { return [cmd('dotnet', ['build', '--no-restore', '/warnaserror-'], 'Compile the solution', i.root)]; }
  unitTestCommands(i: ProjectInspection) { return [cmd('dotnet', ['test', '--no-build', '--verbosity', 'normal'], 'Run the .NET test suite', i.root)]; }
  buildCommands(i: ProjectInspection) { return [cmd('dotnet', ['build', '-c', 'Release', '--no-restore'], 'Build the release configuration', i.root)]; }
  packageCommands(i: ProjectInspection) { return [cmd('dotnet', ['publish', '-c', 'Release', '--no-build'], 'Publish the application', i.root, { optional: true })]; }
  artifactLocations(i: ProjectInspection) { return [joinPath(i.root, 'bin/Release/**')]; }
  environmentRequirements() { return { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/^(.+?\.(?:cs|fs))\((\d+),\d+\):\s*error\s+(\w+):\s*(.+?)(?:\s+\[|$)/gm)) {
      diagnostics.push({ kind: 'compile_error', file: match[1], line: Number(match[2]), message: `${match[3]}: ${match[4].trim()}`, repairable: true });
    }
    if (/Failed!\s+-\s+Failed:\s+[1-9]/.test(output)) {
      diagnostics.push({ kind: 'test_failure', message: 'One or more .NET tests failed', repairable: true });
    }
    if (/NU1101|Unable to find package/.test(output)) {
      diagnostics.push({ kind: 'dependency_error', message: 'A NuGet package could not be found', repairable: true });
    }
    if (toolchainMissing(output, 'dotnet')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'The .NET SDK is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    return diagnostics.some((d) => d.kind === 'dependency_error')
      ? ['Add the PackageReference with a real published version rather than stubbing the type.']
      : [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dart and Flutter
// ─────────────────────────────────────────────────────────────────────────────

export class DartRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'dart';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Dart / Flutter';
  readonly languages = ['dart'] as const;
  readonly runtimes = ['dart', 'flutter'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly sandboxImage = 'registry-1.docker.io/dart:stable';
  readonly manifestNames = ['pubspec.yaml'] as const;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const pubspec = fileAt(files, root, 'pubspec.yaml');
    if (!pubspec) return null;

    // Flutter is a superset with a different CLI, so the distinction changes every command.
    const isFlutter = /^\s*flutter\s*:/m.test(pubspec.content) || /sdk:\s*flutter/.test(pubspec.content);
    const evidence = [joinPath(root, 'pubspec.yaml'), isFlutter ? 'pubspec declares the Flutter SDK' : 'plain Dart package'];
    const lockfiles = fileAt(files, root, 'pubspec.lock') ? [joinPath(root, 'pubspec.lock')] : [];

    return {
      adapterId: this.id, root, languages: ['dart'], manifests: [joinPath(root, 'pubspec.yaml')],
      lockfiles, packageManager: isFlutter ? 'flutter' : 'dart',
      buildSystem: isFlutter ? 'flutter' : 'dart', testRunner: isFlutter ? 'flutter-test' : 'dart-test',
      workspaces: [], entrypoints: fileAt(files, root, 'lib/main.dart') ? [joinPath(root, 'lib/main.dart')] : [],
      confidence: 1, evidence,
    };
  }

  private tool(i: ProjectInspection): string { return i.buildSystem === 'flutter' ? 'flutter' : 'dart'; }

  installCommands(i: ProjectInspection) { return [cmd(this.tool(i), ['pub', 'get'], 'Resolve package dependencies', i.root, { network: 'registry-only' })]; }
  formatCommands(i: ProjectInspection) { return [cmd(this.tool(i), ['format', '--output=none', '--set-exit-if-changed', '.'], 'Check formatting', i.root, { optional: true, source: 'adapter_default' })]; }
  lintCommands(i: ProjectInspection) { return [cmd(this.tool(i), ['analyze'], 'Static analysis', i.root)]; }
  typecheckCommands(i: ProjectInspection) { return this.lintCommands(i); }
  unitTestCommands(i: ProjectInspection) { return [cmd(this.tool(i), ['test'], 'Run the Dart test suite', i.root)]; }
  buildCommands(i: ProjectInspection) {
    // A mobile build needs platform SDKs and signing material the sandbox does not have.
    // Emitting `flutter build apk` here would fail for an environment reason and read like
    // a code defect, so a Flutter project builds nothing and records why.
    return i.buildSystem === 'flutter' ? [] : [cmd('dart', ['compile', 'exe', 'bin/main.dart'], 'Compile a native executable', i.root, { optional: true })];
  }
  packageCommands() { return []; }
  artifactLocations() { return []; }
  environmentRequirements() { return { PUB_CACHE: '/tmp/.pub-cache' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/^\s*(?:error|ERROR)\s+[-•]\s+(.+?)\s+[-•]\s+(.+?):(\d+):\d+/gm)) {
      diagnostics.push({ kind: 'compile_error', file: match[2], line: Number(match[3]), message: match[1].trim(), repairable: true });
    }
    if (/Some tests failed|\d+ test.? failed/i.test(output)) {
      diagnostics.push({ kind: 'test_failure', message: 'One or more Dart tests failed', repairable: true });
    }
    if (toolchainMissing(output, 'flutter') || toolchainMissing(output, 'dart')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'The Dart or Flutter SDK is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    return diagnostics.some((d) => d.kind === 'toolchain_missing')
      ? ['Flutter platform builds also need Android or iOS SDKs and signing material, which are external setup rather than code.']
      : [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHP
// ─────────────────────────────────────────────────────────────────────────────

export class PhpRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'php';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'PHP / Composer';
  readonly languages = ['php'] as const;
  readonly runtimes = ['php'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly sandboxImage = 'registry-1.docker.io/library/php:8.3-cli-alpine';
  readonly manifestNames = ['composer.json'] as const;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const composer = fileAt(files, root, 'composer.json');
    const prefix = root ? `${root}/` : '';
    const phpSources = files.filter((file) => file.path.startsWith(prefix) && file.path.endsWith('.php'));
    if (!composer && !phpSources.length) return null;

    const manifest = readJson<{ scripts?: Record<string, string>; ['require-dev']?: Record<string, string> }>(composer?.content);
    const evidence: string[] = composer ? [joinPath(root, 'composer.json')] : [`${phpSources.length} .php sources without composer.json`];

    // A WordPress plugin is a PHP project with a header comment and no composer entry
    // point — worth naming because its lifecycle and packaging differ completely.
    const wordpress = phpSources.some((file) => /^\s*\/\*+\s*[\s\S]{0,400}?Plugin Name:/m.test(file.content));
    if (wordpress) evidence.push('a WordPress plugin header is present; host conventions apply');

    const devDeps = manifest?.['require-dev'] ?? {};
    const testRunner = devDeps['phpunit/phpunit'] ? 'phpunit' : devDeps['pestphp/pest'] ? 'pest' : manifest?.scripts?.test ? 'script' : null;
    if (testRunner) evidence.push(`test runner: ${testRunner}`);

    return {
      adapterId: this.id, root, languages: ['php'],
      manifests: composer ? [joinPath(root, 'composer.json')] : [],
      lockfiles: fileAt(files, root, 'composer.lock') ? [joinPath(root, 'composer.lock')] : [],
      packageManager: composer ? 'composer' : null, buildSystem: null, testRunner,
      workspaces: [], entrypoints: [],
      confidence: composer ? 1 : 0.55, evidence,
    };
  }

  installCommands(i: ProjectInspection) {
    if (!i.manifests.length) return [];
    return [cmd('composer', ['install', '--no-interaction', '--no-scripts', '--prefer-dist'], 'Install Composer dependencies', i.root, { network: 'registry-only' })];
  }
  formatCommands() { return []; }
  lintCommands(i: ProjectInspection) { return [cmd('php', ['-l', '-d', 'display_errors=1'], 'Syntax check', i.root, { optional: true, source: 'adapter_default' })]; }
  typecheckCommands(i: ProjectInspection) { return [cmd('vendor/bin/phpstan', ['analyse', '--no-progress'], 'Static analysis with PHPStan', i.root, { optional: true, source: 'adapter_default' })]; }
  unitTestCommands(i: ProjectInspection) {
    if (i.testRunner === 'phpunit') return [cmd('vendor/bin/phpunit', ['--colors=never'], 'Run the PHPUnit suite', i.root)];
    if (i.testRunner === 'pest') return [cmd('vendor/bin/pest', ['--colors=never'], 'Run the Pest suite', i.root)];
    if (i.testRunner === 'script') return [cmd('composer', ['run', 'test'], 'Run the declared test script', i.root, { source: 'repository_script' })];
    return [];
  }
  buildCommands() { return []; }
  packageCommands() { return []; }
  artifactLocations() { return []; }
  environmentRequirements() { return { COMPOSER_NO_INTERACTION: '1', COMPOSER_ALLOW_SUPERUSER: '1' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/(?:Parse|Fatal) error:\s*(.+?)\s+in\s+(.+?)\s+on line\s+(\d+)/g)) {
      diagnostics.push({ kind: 'compile_error', file: match[2], line: Number(match[3]), message: match[1].trim(), repairable: true });
    }
    if (/FAILURES!|Tests:\s+\d+,\s+Assertions:\s+\d+,\s+Failures:\s+[1-9]/.test(output)) {
      diagnostics.push({ kind: 'test_failure', message: 'One or more PHP tests failed', repairable: true });
    }
    if (/Could not find package|requires .* but it is not installed/.test(output)) {
      diagnostics.push({ kind: 'dependency_error', message: 'A Composer package could not be resolved', repairable: true });
    }
    if (toolchainMissing(output, 'php') || toolchainMissing(output, 'composer')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'PHP or Composer is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    return diagnostics.some((d) => d.kind === 'dependency_error')
      ? ['Add the package to composer.json require rather than including the file directly.']
      : [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C and C++
// ─────────────────────────────────────────────────────────────────────────────

export class CppRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'cpp';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'C / C++';
  readonly languages = ['c', 'cpp'] as const;
  readonly runtimes = ['native'] as const;
  readonly platforms = ['linux', 'darwin'] as const;
  /**
   * `detected`, deliberately below the others.
   *
   * "How does this build" genuinely has several answers in this ecosystem, and the
   * commands below are correct only when the project follows the conventional layout of
   * whichever build system it declares. Claiming `implementation_available` would overstate
   * how often that holds.
   */
  readonly capabilityState = 'detected' as const;
  readonly sandboxImage = 'registry-1.docker.io/library/gcc:14';
  readonly manifestNames = ['CMakeLists.txt', 'Makefile', 'meson.build'] as const;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const cmake = fileAt(files, root, 'CMakeLists.txt');
    const make = fileAt(files, root, 'Makefile') ?? fileAt(files, root, 'makefile');
    const meson = fileAt(files, root, 'meson.build');
    if (!cmake && !make && !meson) return null;

    // Ordered by specificity: CMake and Meson describe the build declaratively, while a
    // Makefile might only be a convenience wrapper around one of them.
    const buildSystem = cmake ? 'cmake' : meson ? 'meson' : 'make';
    const evidence = [cmake?.path ?? meson?.path ?? make!.path, `build system: ${buildSystem}`];

    const prefix = root ? `${root}/` : '';
    const languages: string[] = [];
    if (files.some((f) => f.path.startsWith(prefix) && /\.(cpp|cc|cxx|hpp)$/.test(f.path))) languages.push('cpp');
    if (files.some((f) => f.path.startsWith(prefix) && /\.(c|h)$/.test(f.path))) languages.push('c');

    return {
      adapterId: this.id, root, languages: languages.length ? languages : ['c'],
      manifests: [cmake?.path ?? meson?.path ?? make!.path], lockfiles: [],
      packageManager: fileAt(files, root, 'conanfile.txt') ? 'conan' : fileAt(files, root, 'vcpkg.json') ? 'vcpkg' : null,
      buildSystem, testRunner: buildSystem === 'cmake' ? 'ctest' : null,
      workspaces: [], entrypoints: [], confidence: 1, evidence,
    };
  }

  installCommands(i: ProjectInspection) {
    if (i.packageManager === 'conan') return [cmd('conan', ['install', '.', '--build=missing'], 'Install Conan dependencies', i.root, { network: 'registry-only' })];
    if (i.packageManager === 'vcpkg') return [cmd('vcpkg', ['install'], 'Install vcpkg dependencies', i.root, { network: 'registry-only' })];
    return [];
  }
  formatCommands() { return []; }
  lintCommands() { return []; }
  typecheckCommands() { return []; }
  unitTestCommands(i: ProjectInspection) {
    if (i.buildSystem === 'cmake') return [cmd('ctest', ['--test-dir', 'build', '--output-on-failure'], 'Run the CTest suite', i.root)];
    if (i.buildSystem === 'meson') return [cmd('meson', ['test', '-C', 'build'], 'Run the Meson test suite', i.root)];
    // A Makefile `test` target is a convention rather than a guarantee, so it stays
    // optional: its absence is not a project defect.
    return [cmd('make', ['test'], 'Run the Makefile test target', i.root, { optional: true })];
  }
  buildCommands(i: ProjectInspection) {
    if (i.buildSystem === 'cmake') {
      return [
        cmd('cmake', ['-S', '.', '-B', 'build', '-DCMAKE_BUILD_TYPE=Release'], 'Configure the CMake build', i.root),
        cmd('cmake', ['--build', 'build', '--config', 'Release'], 'Build with CMake', i.root),
      ];
    }
    if (i.buildSystem === 'meson') {
      return [
        cmd('meson', ['setup', 'build'], 'Configure the Meson build', i.root),
        cmd('meson', ['compile', '-C', 'build'], 'Build with Meson', i.root),
      ];
    }
    return [cmd('make', [], 'Build with make', i.root)];
  }
  packageCommands() { return []; }
  artifactLocations(i: ProjectInspection) { return i.buildSystem === 'make' ? [] : [joinPath(i.root, 'build/**')]; }
  environmentRequirements() { return { CMAKE_COLOR_DIAGNOSTICS: 'OFF' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/^(.+?\.(?:c|cc|cpp|cxx|h|hpp)):(\d+):\d+:\s*(?:fatal\s+)?error:\s*(.+)$/gm)) {
      diagnostics.push({ kind: 'compile_error', file: match[1], line: Number(match[2]), message: match[3].trim(), repairable: true });
    }
    if (/undefined reference to|ld returned \d+ exit status/.test(output)) {
      diagnostics.push({ kind: 'compile_error', message: 'Link failure: a symbol was declared but never defined', repairable: true });
    }
    if (/No such file or directory\s*$/m.test(output) && /#include/.test(output)) {
      diagnostics.push({ kind: 'dependency_error', message: 'A header could not be found on the include path', repairable: true });
    }
    if (toolchainMissing(output, 'cmake') || toolchainMissing(output, 'make') || toolchainMissing(output, 'gcc')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'The C/C++ build toolchain is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    const hints: string[] = [];
    if (diagnostics.some((d) => d.kind === 'compile_error')) hints.push('A link error means a declaration without a definition; check the target sources rather than the header.');
    if (diagnostics.some((d) => d.kind === 'dependency_error')) hints.push('Add the include directory to the build definition rather than using a relative include.');
    return hints;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Solidity / EVM
// ─────────────────────────────────────────────────────────────────────────────

export class SolidityRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'solidity';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Solidity (Foundry or Hardhat)';
  readonly languages = ['solidity'] as const;
  readonly runtimes = ['evm'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  readonly manifestNames = ['foundry.toml', 'hardhat.config.js', 'hardhat.config.ts'] as const;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const foundry = fileAt(files, root, 'foundry.toml');
    const hardhat = fileAt(files, root, 'hardhat.config.ts') ?? fileAt(files, root, 'hardhat.config.js');
    if (!foundry && !hardhat) return null;

    const framework = foundry ? 'forge' : 'hardhat';
    const evidence = [foundry?.path ?? hardhat!.path, `framework: ${framework}`];
    // Foundry writes tests in Solidity itself, so fuzz and invariant tests come free where
    // the project declares them.
    if (foundry && tomlSection(foundry.content, 'fuzz')) evidence.push('fuzz testing is configured');
    if (foundry && tomlSection(foundry.content, 'invariant')) evidence.push('invariant testing is configured');

    return {
      adapterId: this.id, root, languages: ['solidity'],
      manifests: [foundry?.path ?? hardhat!.path],
      lockfiles: fileAt(files, root, 'package-lock.json') ? [joinPath(root, 'package-lock.json')] : [],
      packageManager: foundry ? 'forge' : 'npm', buildSystem: framework,
      testRunner: framework, workspaces: [], entrypoints: [],
      confidence: 1, evidence,
    };
  }

  installCommands(i: ProjectInspection) {
    return i.buildSystem === 'forge'
      ? [cmd('forge', ['install', '--no-git'], 'Install Solidity dependencies', i.root, { network: 'registry-only' })]
      : [cmd('npm', ['ci', '--ignore-scripts'], 'Install Hardhat dependencies', i.root, { network: 'registry-only' })];
  }
  formatCommands(i: ProjectInspection) {
    return i.buildSystem === 'forge' ? [cmd('forge', ['fmt', '--check'], 'Check formatting', i.root, { optional: true, source: 'adapter_default' })] : [];
  }
  lintCommands() { return []; }
  typecheckCommands(i: ProjectInspection) { return this.buildCommands(i); }
  unitTestCommands(i: ProjectInspection) {
    return i.buildSystem === 'forge'
      ? [cmd('forge', ['test', '-vv'], 'Run the Foundry test suite including fuzz tests', i.root)]
      : [cmd('npx', ['hardhat', 'test'], 'Run the Hardhat test suite', i.root)];
  }
  buildCommands(i: ProjectInspection) {
    return i.buildSystem === 'forge'
      ? [cmd('forge', ['build'], 'Compile the contracts', i.root)]
      : [cmd('npx', ['hardhat', 'compile'], 'Compile the contracts', i.root)];
  }
  packageCommands() {
    // Deliberately empty. Deployment is a chain transaction with irreversible cost, and it
    // must never be reachable from a routine validation phase — §41 requires an explicit
    // gate that no adapter should be able to bypass.
    return [];
  }
  artifactLocations(i: ProjectInspection) {
    return i.buildSystem === 'forge' ? [joinPath(i.root, 'out/**')] : [joinPath(i.root, 'artifacts/**')];
  }
  environmentRequirements() { return { FOUNDRY_PROFILE: 'default' }; }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/Error \(\d+\):\s*(.+)\n\s*--> (.+?):(\d+):/g)) {
      diagnostics.push({ kind: 'compile_error', file: match[2], line: Number(match[3]), message: match[1].trim(), repairable: true });
    }
    for (const match of output.matchAll(/\[FAIL(?:\.|:)[^\]]*\]\s*(\S+)/g)) {
      diagnostics.push({ kind: 'test_failure', message: `Failed contract test: ${match[1]}`, repairable: true });
    }
    if (toolchainMissing(output, 'forge') || toolchainMissing(output, 'solc')) {
      diagnostics.push({ kind: 'toolchain_missing', message: 'The Solidity toolchain is not available in the sandbox image', repairable: false });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    return diagnostics.some((d) => d.kind === 'test_failure')
      ? ['A failing invariant or fuzz test is a real finding — narrow the input rather than weakening the assertion.']
      : [];
  }
}

/**
 * Registers all seven.
 *
 * Called once at startup. That this function is the *entire* integration — no planner
 * change, no pipeline change, no registry change — is the property §11 asks for, and it is
 * asserted by a test that adds an eighth ecosystem the codebase has never heard of.
 */
export function registerAdditionalRuntimeAdapters(): void {
  registerRuntimeAdapter(new GoRuntimeAdapter());
  registerRuntimeAdapter(new JvmRuntimeAdapter());
  registerRuntimeAdapter(new DotnetRuntimeAdapter());
  registerRuntimeAdapter(new DartRuntimeAdapter());
  registerRuntimeAdapter(new PhpRuntimeAdapter());
  registerRuntimeAdapter(new CppRuntimeAdapter());
  registerRuntimeAdapter(new SolidityRuntimeAdapter());
}
