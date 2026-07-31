/**
 * Server-controlled allow-list for showcase template sources.
 *
 * The browser only ever sends a template id and version. This module is the sole
 * place that maps an id to a concrete file source, so a caller can never point an
 * export at an arbitrary path. Anything not listed here is rejected outright.
 */

import type { ProjectFile } from '../integrations/githubDeploy.js';
import { buildNextjsScaffold } from '../scaffolds/nextjsScaffold.js';
import { buildExpoScaffold } from '../scaffolds/expoScaffold.js';

export type ShowcaseTemplateId =
  | 'business-website'
  | 'real-estate-platform'
  | 'booking-platform'
  | 'android-app'
  | 'ai-saas'
  | 'web-game';

interface TemplateSource {
  id: ShowcaseTemplateId;
  slug: string;
  version: string;
  /** Builds the file set to copy into the user's repository. */
  build: (opts: { projectName: string; userPrompt?: string }) => ProjectFile[];
  /** Paths that must exist after the copy, else the export is reported failed. */
  criticalPaths: readonly string[];
}

/**
 * Every entry produces files from the existing verified scaffold builders, so an
 * export reuses a known-good base instead of regenerating a product from zero.
 */
const SOURCES: Readonly<Record<ShowcaseTemplateId, TemplateSource>> = {
  'business-website': {
    id: 'business-website',
    slug: 'modern-business-website',
    version: '1.0.0',
    build: buildNextjsScaffold,
    criticalPaths: ['package.json', 'app/layout.tsx', 'app/page.tsx'],
  },
  'real-estate-platform': {
    id: 'real-estate-platform',
    slug: 'real-estate-platform',
    version: '0.1.0',
    build: buildNextjsScaffold,
    criticalPaths: ['package.json', 'app/layout.tsx', 'app/page.tsx'],
  },
  'booking-platform': {
    id: 'booking-platform',
    slug: 'booking-platform',
    version: '0.1.0',
    build: buildNextjsScaffold,
    criticalPaths: ['package.json', 'app/layout.tsx', 'app/page.tsx'],
  },
  'android-app': {
    id: 'android-app',
    slug: 'android-app',
    version: '0.1.0',
    build: buildExpoScaffold,
    criticalPaths: ['package.json', 'app.json', 'app/index.tsx'],
  },
  'ai-saas': {
    id: 'ai-saas',
    slug: 'ai-saas-chatbot',
    version: '0.1.0',
    build: buildNextjsScaffold,
    criticalPaths: ['package.json', 'app/layout.tsx', 'app/page.tsx'],
  },
  'web-game': {
    id: 'web-game',
    slug: 'playable-web-game',
    version: '0.1.0',
    build: buildNextjsScaffold,
    criticalPaths: ['package.json', 'app/layout.tsx', 'app/page.tsx'],
  },
};

export function isShowcaseTemplateId(value: unknown): value is ShowcaseTemplateId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, value);
}

export function resolveTemplateSource(templateId: string): TemplateSource | null {
  if (!isShowcaseTemplateId(templateId)) return null;
  return SOURCES[templateId];
}

/**
 * Produces the files to copy. The shared source is never mutated: builders return
 * a fresh array each call, so a customised export cannot affect other users.
 */
export function buildTemplateFiles(opts: {
  templateId: string;
  projectName: string;
  userPrompt?: string;
}): { source: TemplateSource; files: ProjectFile[] } | null {
  const source = resolveTemplateSource(opts.templateId);
  if (!source) return null;
  const files = source.build({ projectName: opts.projectName, userPrompt: opts.userPrompt });
  return { source, files: files.map((file) => ({ path: file.path, content: file.content })) };
}

/**
 * Prefixes we refuse to write regardless of what the caller asks for. CI workflow
 * files could execute code in the user's repository; `.git` would corrupt it.
 */
const PROTECTED_PREFIXES = ['.github/', '.git/'];

/** Filenames we refuse anywhere in the tree, not only at the root. */
const PROTECTED_SEGMENTS = ['.git', '.env'];

/**
 * Placeholder env files are the documented way a scaffold tells the user which
 * variables to set. They contain names, never values, so they are the one
 * deliberate exception to the `.env*` block.
 */
const ENV_TEMPLATE_NAMES = new Set(['.env.example', '.env.sample', '.env.template']);

/**
 * Rejects traversal, absolute paths, and protected locations. Applied to both the
 * optional target directory and every file path in the plan.
 */
export function isSafeRepoPath(candidate: string): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const normalized = candidate.replace(/\\/g, '/').trim();
  if (!normalized) return false;
  if (normalized.includes('\0')) return false;
  if (normalized.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  // Any `..` at all, not just a bare `..` segment — GitHub stores paths literally,
  // but a checkout of the resulting tree must not be able to escape the repo root.
  if (normalized.includes('..')) return false;
  if (normalized.startsWith('./') || normalized.endsWith('/')) return false;
  if (normalized.includes('//')) return false;

  const lower = normalized.toLowerCase();
  if (PROTECTED_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  for (const segment of lower.split('/')) {
    if (!segment || segment === '.') return false;
    if (ENV_TEMPLATE_NAMES.has(segment)) continue;
    // Matches `.env`, `.env.local`, `.env.production`, and any future variant.
    if (PROTECTED_SEGMENTS.some((name) => segment === name || segment.startsWith(`${name}.`))) return false;
  }
  return true;
}

/** Validates and normalises an optional target directory inside the repo. */
export function normalizeTargetDirectory(input: unknown): string | null | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  if (typeof input !== 'string') return null;
  const trimmed = input.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!trimmed) return undefined;
  if (!isSafeRepoPath(trimmed)) return null;
  return trimmed;
}
