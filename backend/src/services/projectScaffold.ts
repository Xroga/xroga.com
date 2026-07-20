import { normalizeBuildFiles } from '../lib/normalizeBuildSource.js';
import { buildInlinePreviewDocument } from '../lib/landingPreview.js';
import { vercelStaticSiteJson } from '../lib/vercelStaticConfig.js';
import type { ProjectFile } from './integrations/githubDeploy.js';
import { detectScaffoldKind, type ScaffoldKind } from './scaffolds/detectScaffold.js';
import { buildExpoScaffold } from './scaffolds/expoScaffold.js';
import { buildNextjsScaffold } from './scaffolds/nextjsScaffold.js';
import { buildChromeExtensionScaffold } from './scaffolds/chromeExtensionScaffold.js';
import { buildElectronScaffold } from './scaffolds/electronScaffold.js';

export { detectScaffoldKind, type ScaffoldKind } from './scaffolds/detectScaffold.js';

/**
 * Minimal static project scaffold for GitHub/Vercel push.
 */
export function buildFullProjectFiles(opts: {
  html: string;
  css?: string;
  js?: string;
  projectName?: string;
  userPrompt?: string;
}): ProjectFile[] {
  const normalized = normalizeBuildFiles(opts.html, opts.css ?? '', opts.js ?? '');
  const merged = buildInlinePreviewDocument(normalized.html, normalized.css, normalized.js);
  const name = (opts.projectName || 'XROGA Build').trim() || 'XROGA Build';

  return [
    { path: 'index.html', content: merged },
    { path: 'styles.css', content: normalized.css },
    { path: 'script.js', content: normalized.js },
    { path: 'vercel.json', content: vercelStaticSiteJson() },
    {
      path: 'README.md',
      content: `# ${name}\n\nBuilt with Xroga AI (#1 coding agent).\n\n${opts.userPrompt ? `## Prompt\n\n${opts.userPrompt.slice(0, 500)}\n` : ''}`,
    },
  ];
}

export function scaffoldFilePaths(prompt?: string): string[] {
  const kind = detectScaffoldKind(prompt || '');
  if (kind === 'expo') {
    return ['package.json', 'app.json', 'app/index.tsx', 'app/_layout.tsx', 'index.html', 'README.md'];
  }
  if (kind === 'chrome') {
    return ['manifest.json', 'background.js', 'popup.html', 'package.json', 'PUBLISH.md', 'README.md'];
  }
  if (kind === 'electron') {
    return ['package.json', 'main.js', 'renderer/index.html', 'PUBLISH.md', 'README.md'];
  }
  if (kind === 'nextjs') {
    return [
      'package.json',
      'app/page.tsx',
      'app/layout.tsx',
      'app/api/health/route.ts',
      'app/api/chat/route.ts',
      '.env.example',
      'README.md',
    ];
  }
  return ['index.html', 'styles.css', 'script.js', 'vercel.json', 'README.md'];
}

/** Deterministic scaffold tree for a prompt. */
export function buildScaffoldForPrompt(opts: {
  prompt: string;
  projectName: string;
}): { kind: ScaffoldKind; files: ProjectFile[] } {
  const kind = detectScaffoldKind(opts.prompt);
  if (kind === 'expo') {
    return { kind, files: buildExpoScaffold({ projectName: opts.projectName, userPrompt: opts.prompt }) };
  }
  if (kind === 'chrome') {
    return {
      kind,
      files: buildChromeExtensionScaffold({ projectName: opts.projectName, userPrompt: opts.prompt }),
    };
  }
  if (kind === 'electron') {
    return {
      kind,
      files: buildElectronScaffold({ projectName: opts.projectName, userPrompt: opts.prompt }),
    };
  }
  if (kind === 'nextjs') {
    return {
      kind,
      files: buildNextjsScaffold({ projectName: opts.projectName, userPrompt: opts.prompt }),
    };
  }
  return {
    kind: 'static',
    files: buildFullProjectFiles({
      html: `<!doctype html><html><head><meta charset="utf-8"><title>${opts.projectName}</title></head><body><h1>${opts.projectName}</h1></body></html>`,
      css: '',
      js: '',
      projectName: opts.projectName,
      userPrompt: opts.prompt,
    }),
  };
}

/**
 * Merge AI-generated files over a scaffold. Scaffold fills missing structure
 * (package.json, API routes, auth) so user vault keys can power live features.
 */
export function mergeScaffoldWithGenerated(
  scaffold: ProjectFile[],
  generated: ProjectFile[],
): ProjectFile[] {
  const map = new Map<string, string>();
  for (const f of scaffold) map.set(f.path, f.content);
  for (const f of generated) {
    // Prefer non-empty AI output; keep scaffold if AI emitted empty stub
    if (f.content.trim()) map.set(f.path, f.content);
  }
  return [...map.entries()].map(([path, content]) => ({ path, content }));
}

export function looksLikeFrameworkProject(files: ProjectFile[]): boolean {
  if (files.some((f) => f.path === 'manifest.json')) return true;
  const pkg = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
  if (!pkg) return false;
  try {
    const json = JSON.parse(pkg.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...json.dependencies, ...json.devDependencies };
    return Boolean(
      deps.next ||
        deps.expo ||
        deps['react-native'] ||
        deps.vite ||
        deps.nuxt ||
        deps.electron,
    );
  } catch {
    return /"next"|"expo"|"react-native"|"electron"/i.test(pkg.content);
  }
}

export function detectFrameworkFromFiles(
  files: ProjectFile[],
): 'nextjs' | 'expo' | 'vite' | 'chrome' | 'electron' | 'static' | null {
  if (files.some((f) => f.path === 'manifest.json')) return 'chrome';
  const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
  if (/"expo"|"expo-router"/i.test(pkg)) return 'expo';
  if (/"electron"/i.test(pkg)) return 'electron';
  if (/"next"/i.test(pkg)) return 'nextjs';
  if (/"vite"/i.test(pkg)) return 'vite';
  if (files.some((f) => f.path === 'index.html')) return 'static';
  return null;
}
