/**
 * Python, across the four dependency workflows that actually appear in repositories.
 *
 * Python is the ecosystem where "install the dependencies" is genuinely ambiguous, and
 * getting it wrong is not a style question. `pip install -r requirements.txt` in a Poetry
 * project installs nothing useful, because the dependencies live in `pyproject.toml` under
 * `[tool.poetry.dependencies]` and there is no requirements file to read. A uv project has
 * a `uv.lock` that pip cannot consume at all.
 *
 * So the workflow is detected from committed evidence, in a fixed precedence:
 *
 *   1. `uv.lock`            → uv
 *   2. `poetry.lock`        → Poetry
 *   3. `Pipfile.lock`       → Pipenv
 *   4. `[tool.poetry]`      → Poetry without a lockfile
 *   5. `[project]` in       → pip with PEP 621 metadata
 *      `pyproject.toml`
 *   6. `requirements*.txt`  → pip
 *
 * Lockfiles rank above manifest sections for the same reason as in Node: a lockfile
 * records what actually resolved, while a manifest section records an intention.
 *
 * The test runner is read the same way. pytest is the common case but not the universal
 * one, and a project configured for `unittest` should not be handed a pytest invocation
 * that collects nothing and exits 0 — §18 counts that as a failure, correctly.
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

type Workflow = 'uv' | 'poetry' | 'pipenv' | 'pip';

interface PythonFacts {
  workflow: Workflow;
  manifests: string[];
  lockfiles: string[];
  testRunner: string | null;
  hasBuildBackend: boolean;
  evidence: string[];
}

const REQUIREMENTS = ['requirements.txt', 'requirements-dev.txt', 'requirements/base.txt'];

function detectWorkflow(files: readonly ProjectFile[], root: string, facts: PythonFacts): void {
  const pyproject = fileAt(files, root, 'pyproject.toml')?.content;

  if (fileAt(files, root, 'uv.lock')) {
    facts.workflow = 'uv';
    facts.lockfiles.push(joinPath(root, 'uv.lock'));
    facts.evidence.push(`${joinPath(root, 'uv.lock')} identifies uv`);
    return;
  }
  if (fileAt(files, root, 'poetry.lock')) {
    facts.workflow = 'poetry';
    facts.lockfiles.push(joinPath(root, 'poetry.lock'));
    facts.evidence.push(`${joinPath(root, 'poetry.lock')} identifies Poetry`);
    return;
  }
  if (fileAt(files, root, 'Pipfile.lock') || fileAt(files, root, 'Pipfile')) {
    facts.workflow = 'pipenv';
    if (fileAt(files, root, 'Pipfile.lock')) facts.lockfiles.push(joinPath(root, 'Pipfile.lock'));
    facts.evidence.push('Pipfile identifies Pipenv');
    return;
  }
  if (tomlSection(pyproject, 'tool.poetry')) {
    facts.workflow = 'poetry';
    facts.evidence.push('pyproject.toml [tool.poetry] identifies Poetry without a lockfile');
    return;
  }
  facts.workflow = 'pip';
  facts.evidence.push('no lockfile or Poetry section; using pip');
}

export class PythonRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'python';
  readonly adapterVersion = '1.0.0';
  readonly displayName = 'Python';
  readonly languages = ['python'] as const;
  readonly runtimes = ['cpython'] as const;
  readonly platforms = ['linux', 'darwin', 'win32'] as const;
  readonly capabilityState = 'implementation_available' as const;
  /** Verified on a real machine: Python 3.12.13 with pip 25.0.1. */
  readonly sandboxImage = 'registry-1.docker.io/library/python:3.12-alpine';
  readonly manifestNames = [
    'pyproject.toml',
    'requirements.txt',
    'setup.py',
    'setup.cfg',
    'Pipfile',
  ] as const;

  detect(files: readonly ProjectFile[], root = ''): ProjectInspection | null {
    const present = this.manifestNames.filter((name) => fileAt(files, root, name));
    const hasRequirements = REQUIREMENTS.some((name) => fileAt(files, root, name));
    const prefix = root ? `${root}/` : '';
    const pythonSources = files.filter(
      (f) => f.path.startsWith(prefix) && f.path.endsWith('.py'),
    );

    if (!present.length && !hasRequirements && !pythonSources.length) return null;

    const facts: PythonFacts = {
      workflow: 'pip',
      manifests: present.map((name) => joinPath(root, name)),
      lockfiles: [],
      testRunner: null,
      hasBuildBackend: false,
      evidence: [],
    };
    for (const name of REQUIREMENTS) {
      if (fileAt(files, root, name)) facts.manifests.push(joinPath(root, name));
    }
    detectWorkflow(files, root, facts);

    const pyproject = fileAt(files, root, 'pyproject.toml')?.content;
    facts.hasBuildBackend = tomlSection(pyproject, 'build-system');
    if (facts.hasBuildBackend) {
      facts.evidence.push('pyproject.toml [build-system] means a distributable package');
    }

    // Precedence matters: an explicit config section is a decision, while a pytest
    // dependency is only a hint that something might use it.
    if (fileAt(files, root, 'pytest.ini') || tomlSection(pyproject, 'tool.pytest.ini_options')) {
      facts.testRunner = 'pytest';
      facts.evidence.push('pytest configuration present');
    } else if (files.some((f) => f.path.startsWith(prefix) && /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f.path))) {
      facts.testRunner = 'pytest';
      facts.evidence.push('pytest-style test files present');
    } else if (files.some((f) => f.path.startsWith(prefix) && /(^|\/)tests?\//.test(f.path))) {
      facts.testRunner = 'unittest';
      facts.evidence.push('a tests directory without pytest naming; using unittest discovery');
    }

    const entrypoints: string[] = [];
    const scriptName = tomlValue(pyproject, 'project.scripts', 'main');
    if (scriptName) entrypoints.push(scriptName);
    for (const candidate of ['main.py', 'app.py', '__main__.py', 'manage.py']) {
      if (fileAt(files, root, candidate)) entrypoints.push(joinPath(root, candidate));
    }

    if (!facts.manifests.length) {
      facts.evidence.push(
        `${pythonSources.length} .py sources without a manifest; dependency install is not possible`,
      );
    }

    return {
      adapterId: this.id,
      root,
      languages: ['python'],
      manifests: facts.manifests,
      lockfiles: facts.lockfiles,
      packageManager: facts.workflow,
      buildSystem: facts.hasBuildBackend ? 'pep517' : null,
      testRunner: facts.testRunner,
      workspaces: [],
      entrypoints,
      // Sources alone are weaker evidence than a manifest: a repository can carry a stray
      // .py script without being a Python project, so a competing adapter should win.
      confidence: facts.manifests.length ? 1 : 0.55,
      evidence: facts.evidence,
    };
  }

  installCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const cwd = inspection.root;
    const net = 'registry-only' as const;
    switch (inspection.packageManager) {
      case 'uv':
        return [{ command: 'uv', args: ['sync', '--frozen'], networkPolicy: net, source: 'manifest', purpose: 'Install the locked uv environment', cwd }];
      case 'poetry':
        return [{ command: 'poetry', args: ['install', '--no-interaction', '--no-ansi'], networkPolicy: net, source: 'manifest', purpose: 'Install the Poetry environment', cwd }];
      case 'pipenv':
        return [{ command: 'pipenv', args: ['install', '--dev', '--deploy'], networkPolicy: net, source: 'manifest', purpose: 'Install the Pipenv environment', cwd }];
      default: {
        const requirements = inspection.manifests.find((m) => m.endsWith('requirements.txt'));
        if (requirements) {
          const relative = inspection.root ? requirements.slice(inspection.root.length + 1) : requirements;
          return [{ command: 'pip', args: ['install', '-r', relative], networkPolicy: net, source: 'manifest', purpose: 'Install from requirements.txt', cwd }];
        }
        if (inspection.buildSystem === 'pep517') {
          // `-e .` builds the project's own metadata and pulls its declared dependencies,
          // which is the correct move for a PEP 621 project with no requirements file.
          return [{ command: 'pip', args: ['install', '-e', '.'], networkPolicy: net, source: 'manifest', purpose: 'Install the project and its declared dependencies', cwd }];
        }
        // No manifest means nothing to install. Returning a command here would run pip
        // against nothing and report success for a step that did not happen.
        return [];
      }
    }
  }

  /** Prefixes a command so it runs inside the environment the workflow created. */
  private inEnvironment(
    inspection: ProjectInspection,
    command: string,
    args: readonly string[],
  ): { command: string; args: readonly string[] } {
    switch (inspection.packageManager) {
      case 'uv':
        return { command: 'uv', args: ['run', command, ...args] };
      case 'poetry':
        return { command: 'poetry', args: ['run', command, ...args] };
      case 'pipenv':
        return { command: 'pipenv', args: ['run', command, ...args] };
      default:
        return { command, args };
    }
  }

  formatCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const { command, args } = this.inEnvironment(inspection, 'ruff', ['format', '--check', '.']);
    return [{ command, args, networkPolicy: 'none', source: 'adapter_default', purpose: 'Check formatting with ruff', cwd: inspection.root, optional: true }];
  }

  lintCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    const { command, args } = this.inEnvironment(inspection, 'ruff', ['check', '.']);
    return [{ command, args, networkPolicy: 'none', source: 'adapter_default', purpose: 'Lint with ruff', cwd: inspection.root, optional: true }];
  }

  typecheckCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    // Optional because Python type checking is opt-in. A project with no annotations is
    // not broken, and failing it for that would be an opinion rather than a defect.
    const { command, args } = this.inEnvironment(inspection, 'mypy', ['.']);
    return [{ command, args, networkPolicy: 'none', source: 'adapter_default', purpose: 'Type-check with mypy', cwd: inspection.root, optional: true }];
  }

  unitTestCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    if (inspection.testRunner === 'pytest') {
      const { command, args } = this.inEnvironment(inspection, 'pytest', ['-q']);
      return [{ command, args, networkPolicy: 'none', source: 'manifest', purpose: 'Run the pytest suite', cwd: inspection.root }];
    }
    if (inspection.testRunner === 'unittest') {
      const { command, args } = this.inEnvironment(inspection, 'python', ['-m', 'unittest', 'discover', '-v']);
      return [{ command, args, networkPolicy: 'none', source: 'manifest', purpose: 'Run unittest discovery', cwd: inspection.root }];
    }
    return [];
  }

  buildCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    // Only a project declaring a build backend has something to build. An application —
    // a FastAPI service, a Django site — has no build step, and inventing one would fail
    // a correct repository.
    if (inspection.buildSystem !== 'pep517') return [];
    const { command, args } = this.inEnvironment(inspection, 'python', ['-m', 'build']);
    return [{ command, args, networkPolicy: 'none', source: 'manifest', purpose: 'Build the wheel and sdist', cwd: inspection.root }];
  }

  packageCommands(inspection: ProjectInspection): readonly ToolCommand[] {
    return this.buildCommands(inspection);
  }

  artifactLocations(inspection: ProjectInspection): readonly string[] {
    return inspection.buildSystem === 'pep517' ? [joinPath(inspection.root, 'dist/*.whl')] : [];
  }

  environmentRequirements(): Readonly<Record<string, string>> {
    // Unbuffered output so a crashed run still shows what it printed, and no .pyc files
    // in a workspace that will be inspected as a diff.
    return { PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
  }

  parseFailure(output: string): readonly ParsedDiagnostic[] {
    const diagnostics: ParsedDiagnostic[] = [];
    for (const match of output.matchAll(/File "([^"]+)", line (\d+)[\s\S]{0,200}?^(\w+Error): (.+)$/gm)) {
      diagnostics.push({
        kind: match[3] === 'SyntaxError' ? 'compile_error' : 'test_failure',
        file: match[1],
        line: Number(match[2]),
        message: `${match[3]}: ${match[4].trim()}`,
        repairable: true,
      });
    }
    for (const match of output.matchAll(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/g)) {
      diagnostics.push({
        kind: 'dependency_error',
        message: `Missing module: ${match[1]}`,
        repairable: true,
      });
    }
    // pytest's own summary line, which is the reliable count when a traceback is absent.
    const summary = output.match(/^=+ (\d+) failed(?:, (\d+) passed)?/m);
    if (summary) {
      diagnostics.push({
        kind: 'test_failure',
        message: `${summary[1]} pytest test(s) failed`,
        repairable: true,
      });
    }
    if (/No module named (?:pytest|build)\b|command not found/.test(output)) {
      diagnostics.push({
        kind: 'toolchain_missing',
        message: 'The Python toolchain required for this step is not installed in the sandbox',
        repairable: false,
      });
    }
    return diagnostics;
  }

  repairHints(diagnostics: readonly ParsedDiagnostic[]): readonly string[] {
    const hints: string[] = [];
    if (diagnostics.some((d) => d.kind === 'dependency_error')) {
      hints.push('Declare the missing package in the project manifest, not with a try/except ImportError.');
    }
    if (diagnostics.some((d) => d.kind === 'compile_error')) {
      hints.push('Fix the syntax error at the reported line before rerunning anything else.');
    }
    if (diagnostics.some((d) => d.kind === 'toolchain_missing')) {
      hints.push('Report the missing interpreter or tool as a blocker — no source change can fix it.');
    }
    return hints;
  }
}
