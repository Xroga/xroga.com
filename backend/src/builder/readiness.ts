import type { ProjectFile } from '../ai/patches.js';

/**
 * Strict readiness verification, run after the live-preview coordinator reports its own start.
 *
 * "A process was launched" is not readiness, and neither is any status below 500: a framework dev
 * server answers 404 pages and error overlays with a perfectly alive process. This asks the running
 * application for its real routes from inside the isolated runtime and requires a successful,
 * non-empty, non-error response for every one.
 */

export interface ExecResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export type RuntimeExec = (command: {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}) => Promise<ExecResult>;

export interface RouteReadiness {
  readonly path: string;
  readonly status: number | null;
  readonly bytes: number;
  readonly ok: boolean;
  readonly problem: string | null;
}

export interface ReadinessReport {
  readonly ready: boolean;
  readonly routes: readonly RouteReadiness[];
  readonly reason: string;
}

const ERROR_MARKERS = [
  'Application error',
  'Internal Server Error',
  'Unhandled Runtime Error',
  'Cannot GET',
  'ECONNREFUSED',
  'Module not found',
  'Failed to compile',
];

export const MAX_READINESS_ROUTES = 8;

/** Concrete, non-dynamic routes the generated project actually defines. */
export function routesFromFiles(files: readonly ProjectFile[]): string[] {
  const routes = new Set<string>(['/']);
  for (const file of files) {
    const app = /^(?:src\/)?app\/(.*)\/?page\.(?:tsx|jsx|ts|js)$/.exec(file.path);
    if (app) {
      const segments = app[1].split('/').filter(Boolean).filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
      if (segments.some((segment) => segment.startsWith('[') || segment.startsWith('@'))) continue;
      routes.add(segments.length ? `/${segments.join('/')}` : '/');
      continue;
    }
    const html = /^(?!node_modules\/)([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)\.html$/.exec(file.path);
    if (html && file.path !== 'index.html' && !file.path.includes('/')) routes.add(`/${html[1]}.html`);
  }
  return [...routes].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, MAX_READINESS_ROUTES);
}

function probeScript(paths: readonly string[], port: number): string {
  return [
    `const paths=${JSON.stringify(paths)};`,
    `(async()=>{const out=[];for(const p of paths){try{`,
    `const r=await fetch('http://[::1]:${port}'+p,{redirect:'follow',signal:AbortSignal.timeout(8000)});`,
    `const t=await r.text();out.push({path:p,status:r.status,bytes:t.length,text:t.slice(0,4000)});`,
    `}catch(e){out.push({path:p,status:null,bytes:0,text:''})}}`,
    `console.log('XROGA_READINESS '+JSON.stringify(out));process.exit(0)})()`,
  ].join('');
}

export function parseReadiness(stdout: string, paths: readonly string[]): RouteReadiness[] {
  const line = stdout.split('\n').find((entry) => entry.startsWith('XROGA_READINESS '));
  let parsed: Array<{ path: string; status: number | null; bytes: number; text: string }> = [];
  if (line) {
    try {
      parsed = JSON.parse(line.slice('XROGA_READINESS '.length)) as typeof parsed;
    } catch {
      parsed = [];
    }
  }
  return paths.map((path) => {
    const seen = parsed.find((entry) => entry.path === path);
    if (!seen || seen.status === null) return { path, status: null, bytes: 0, ok: false, problem: 'No response from the application.' };
    if (seen.status < 200 || seen.status >= 300) return { path, status: seen.status, bytes: seen.bytes, ok: false, problem: `HTTP ${seen.status}.` };
    if (seen.bytes === 0) return { path, status: seen.status, bytes: 0, ok: false, problem: 'Empty response body.' };
    const marker = ERROR_MARKERS.find((candidate) => seen.text.includes(candidate));
    if (marker) return { path, status: seen.status, bytes: seen.bytes, ok: false, problem: `The page rendered an error ("${marker}").` };
    return { path, status: seen.status, bytes: seen.bytes, ok: true, problem: null };
  });
}

export async function verifyAppReadiness(input: {
  readonly exec: RuntimeExec;
  readonly files: readonly ProjectFile[];
  readonly port?: number;
}): Promise<ReadinessReport> {
  const paths = routesFromFiles(input.files);
  let result: ExecResult;
  try {
    result = await input.exec({ command: 'node', args: ['-e', probeScript(paths, input.port ?? 3000)], timeoutMs: 90_000 });
  } catch {
    return { ready: false, routes: parseReadiness('', paths), reason: 'The readiness check could not run inside the isolated runtime.' };
  }
  if (result.timedOut) return { ready: false, routes: parseReadiness('', paths), reason: 'The readiness check timed out.' };
  const routes = parseReadiness(result.stdout, paths);
  const failing = routes.filter((route) => !route.ok);
  if (failing.length > 0) {
    return { ready: false, routes, reason: `${failing.length} of ${routes.length} route(s) failed: ${failing.map((route) => `${route.path} (${route.problem})`).join('; ')}` };
  }
  return { ready: true, routes, reason: `All ${routes.length} route(s) responded successfully.` };
}
