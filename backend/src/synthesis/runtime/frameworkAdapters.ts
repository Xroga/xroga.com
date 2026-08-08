/**
 * Frameworks as adapters rather than as prose inside prompts.
 *
 * A runtime adapter knows how to run Python. It does not know that Django keeps routes in
 * `urls.py`, that migrations are generated rather than hand-written, or that `DEBUG=True`
 * must never reach production. That knowledge currently lives in model prompts, which
 * means it is unversioned, untestable, and silently different for every code path that
 * happens to mention a framework.
 *
 * §13's requirement is that framework knowledge be structured and that unknown frameworks
 * stay discoverable. Both matter, and the second is the one that is easy to lose: a
 * framework registry that rejects what it does not recognise is the same closed-list
 * mistake as the scaffold detector, one layer down. So detection returns evidence and
 * absence is an ordinary answer — `null` means "no known framework here", not "this
 * repository is unsupported".
 *
 * Deliberately *not* here: build and test commands. Those belong to the runtime adapter,
 * because `npm test` is the same command whether the project is Next.js or Express, and
 * duplicating it per framework is how the two layers drift apart.
 */

import type { ProjectFile } from '../../ai/patches.js';
import { fileAt, joinPath, readJson, type ProjectInspection } from './adapterContract.js';

export type FrameworkCapabilityState = 'planned' | 'detected' | 'conventions_known' | 'fixture_verified';

export interface FrameworkAdapter {
  readonly id: string;
  readonly displayName: string;
  /** The runtime adapter this framework runs on. */
  readonly runtimeId: string;
  readonly language: string;
  readonly capabilityState: FrameworkCapabilityState;

  /** Where routes, config and migrations live, as repo-relative hints. */
  readonly conventions: {
    readonly routes: readonly string[];
    readonly config: readonly string[];
    readonly migrations: readonly string[];
    readonly staticAssets: readonly string[];
    readonly entrypoints: readonly string[];
  };

  /** Constraints a generated project must respect to run at all. */
  readonly constraints: readonly string[];

  /** Deployment facts that change what a plan may promise. */
  readonly deployment: {
    readonly needsServer: boolean;
    readonly canBeStatic: boolean;
    readonly notes: readonly string[];
  };

  /** Null when this framework is not present. */
  detect(files: readonly ProjectFile[], root?: string): FrameworkDetection | null;
}

export interface FrameworkDetection {
  readonly frameworkId: string;
  readonly root: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly version: string | null;
}

/** Reads a dependency version out of a package.json without throwing. */
function nodeDependency(
  files: readonly ProjectFile[],
  root: string,
  name: string,
): string | null {
  const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
    fileAt(files, root, 'package.json')?.content,
  );
  if (!pkg) return null;
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? null;
}

/** Matches a package name in a Python manifest or requirements file. */
function pythonDependency(files: readonly ProjectFile[], root: string, name: string): boolean {
  const sources = ['pyproject.toml', 'requirements.txt', 'Pipfile']
    .map((manifest) => fileAt(files, root, manifest)?.content)
    .filter(Boolean) as string[];
  const pattern = new RegExp(`(^|[\\s"'\\[])${name}([\\s"'\\]=<>~!,]|$)`, 'im');
  return sources.some((content) => pattern.test(content));
}

const nodeFramework = (input: {
  id: string;
  displayName: string;
  packageName: string;
  markerFiles?: readonly string[];
  conventions: FrameworkAdapter['conventions'];
  constraints?: readonly string[];
  deployment: FrameworkAdapter['deployment'];
}): FrameworkAdapter => ({
  id: input.id,
  displayName: input.displayName,
  runtimeId: 'node',
  language: 'typescript',
  capabilityState: 'conventions_known',
  conventions: input.conventions,
  constraints: input.constraints ?? [],
  deployment: input.deployment,
  detect(files, root = '') {
    const version = nodeDependency(files, root, input.packageName);
    const marker = (input.markerFiles ?? []).find((name) => fileAt(files, root, name));
    if (!version && !marker) return null;
    const evidence: string[] = [];
    if (version) evidence.push(`${input.packageName}@${version} in package.json`);
    if (marker) evidence.push(joinPath(root, marker));
    return {
      frameworkId: input.id,
      root,
      // A declared dependency is stronger evidence than a config file, which can be left
      // behind by a framework that has since been removed.
      confidence: version ? 1 : 0.7,
      evidence,
      version,
    };
  },
});

const pythonFramework = (input: {
  id: string;
  displayName: string;
  packageName: string;
  markerFiles?: readonly string[];
  conventions: FrameworkAdapter['conventions'];
  constraints?: readonly string[];
  deployment: FrameworkAdapter['deployment'];
}): FrameworkAdapter => ({
  id: input.id,
  displayName: input.displayName,
  runtimeId: 'python',
  language: 'python',
  capabilityState: 'conventions_known',
  conventions: input.conventions,
  constraints: input.constraints ?? [],
  deployment: input.deployment,
  detect(files, root = '') {
    const declared = pythonDependency(files, root, input.packageName);
    const marker = (input.markerFiles ?? []).find((name) => fileAt(files, root, name));
    if (!declared && !marker) return null;
    const evidence: string[] = [];
    if (declared) evidence.push(`${input.packageName} declared in the Python manifest`);
    if (marker) evidence.push(joinPath(root, marker));
    return { frameworkId: input.id, root, confidence: declared ? 1 : 0.7, evidence, version: null };
  },
});

const BUILT_IN: readonly FrameworkAdapter[] = [
  nodeFramework({
    id: 'next', displayName: 'Next.js', packageName: 'next',
    markerFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    conventions: {
      routes: ['app/**/page.tsx', 'app/**/route.ts', 'pages/**/*.tsx'],
      config: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      migrations: [], staticAssets: ['public/**'], entrypoints: ['app/layout.tsx', 'pages/_app.tsx'],
    },
    constraints: [
      'Server components cannot use browser APIs; a component needing them must be marked "use client".',
      'Environment variables reach the browser only when prefixed NEXT_PUBLIC_, which makes that prefix a disclosure decision rather than a naming one.',
    ],
    deployment: { needsServer: true, canBeStatic: true, notes: ['static export drops API routes and server components'] },
  }),
  nodeFramework({
    id: 'express', displayName: 'Express', packageName: 'express',
    conventions: {
      routes: ['routes/**/*.ts', 'src/routes/**/*.ts'], config: ['.env.example'],
      migrations: ['migrations/**'], staticAssets: ['public/**'], entrypoints: ['src/index.ts', 'index.js'],
    },
    constraints: ['Error-handling middleware must be registered last or it never runs.'],
    deployment: { needsServer: true, canBeStatic: false, notes: [] },
  }),
  nodeFramework({
    id: 'fastify', displayName: 'Fastify', packageName: 'fastify',
    conventions: {
      routes: ['routes/**/*.ts'], config: ['.env.example'], migrations: ['migrations/**'],
      staticAssets: ['public/**'], entrypoints: ['src/server.ts'],
    },
    deployment: { needsServer: true, canBeStatic: false, notes: [] },
  }),
  pythonFramework({
    id: 'fastapi', displayName: 'FastAPI', packageName: 'fastapi',
    conventions: {
      routes: ['app/routers/**/*.py', 'routers/**/*.py'], config: ['app/config.py', '.env.example'],
      migrations: ['alembic/versions/**', 'migrations/**'], staticAssets: ['static/**'],
      entrypoints: ['app/main.py', 'main.py'],
    },
    constraints: [
      'Request and response models are Pydantic classes; validation belongs there rather than inside handlers.',
      'A blocking call inside an async handler stalls the event loop — use a sync def or a thread pool.',
    ],
    deployment: { needsServer: true, canBeStatic: false, notes: ['needs an ASGI server such as uvicorn'] },
  }),
  pythonFramework({
    id: 'django', displayName: 'Django', packageName: 'django',
    markerFiles: ['manage.py'],
    conventions: {
      routes: ['**/urls.py'], config: ['**/settings.py'], migrations: ['**/migrations/*.py'],
      staticAssets: ['static/**'], entrypoints: ['manage.py', '**/wsgi.py', '**/asgi.py'],
    },
    constraints: [
      'Migrations are generated by makemigrations, not written by hand; a hand-written one desynchronises the migration graph.',
      'DEBUG must be False in production — it exposes stack traces and settings to anyone who triggers an error.',
    ],
    deployment: { needsServer: true, canBeStatic: false, notes: ['collectstatic must run before serving static files'] },
  }),
  pythonFramework({
    id: 'flask', displayName: 'Flask', packageName: 'flask',
    conventions: {
      routes: ['app.py', 'app/routes/**/*.py'], config: ['config.py', '.env.example'],
      migrations: ['migrations/**'], staticAssets: ['static/**'], entrypoints: ['app.py', 'wsgi.py'],
    },
    deployment: { needsServer: true, canBeStatic: false, notes: ['the development server is not for production use'] },
  }),
];

let registry: FrameworkAdapter[] | null = null;

export function frameworkAdapters(): readonly FrameworkAdapter[] {
  if (!registry) registry = [...BUILT_IN];
  return registry;
}

/** Adds or replaces a framework adapter, so §13 stays additive. */
export function registerFrameworkAdapter(adapter: FrameworkAdapter): void {
  const list = frameworkAdapters() as FrameworkAdapter[];
  const existing = list.findIndex((candidate) => candidate.id === adapter.id);
  if (existing >= 0) list[existing] = adapter;
  else list.push(adapter);
}

export function setFrameworkAdaptersForTesting(adapters: FrameworkAdapter[] | null): void {
  registry = adapters;
}

export function frameworkById(id: string): FrameworkAdapter | null {
  return frameworkAdapters().find((adapter) => adapter.id === id) ?? null;
}

/**
 * The framework in use at a component root, or null.
 *
 * Null is an ordinary answer. Most repositories that use no framework are perfectly
 * healthy, and a registry that treats absence as a problem is the closed-list mistake one
 * layer down from the scaffold detector.
 *
 * Only frameworks matching the component's runtime are considered, so a Python service
 * cannot be reported as running Express because a sibling `package.json` mentions it.
 */
export function detectFramework(
  files: readonly ProjectFile[],
  inspection: ProjectInspection,
): FrameworkDetection | null {
  let best: FrameworkDetection | null = null;
  for (const adapter of frameworkAdapters()) {
    if (adapter.runtimeId !== inspection.adapterId) continue;
    const detection = adapter.detect(files, inspection.root);
    if (!detection) continue;
    if (!best || detection.confidence > best.confidence) best = detection;
  }
  return best;
}

/**
 * Constraints a plan must respect for a detected framework.
 *
 * Returned as data so they can be attached to an architecture decision and reviewed,
 * rather than pasted into a prompt where nothing can check they were applied.
 */
export function frameworkConstraints(detection: FrameworkDetection | null): readonly string[] {
  if (!detection) return [];
  return frameworkById(detection.frameworkId)?.constraints ?? [];
}

/** Whether a detected framework can be deployed as static files. */
export function canDeployStatically(detection: FrameworkDetection | null): boolean {
  if (!detection) return false;
  return frameworkById(detection.frameworkId)?.deployment.canBeStatic ?? false;
}
