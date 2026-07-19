/**
 * Cheap (no-AI) selection of which project files to send for an update turn.
 * Keeps token cost low: path listing for all + full content only for targets.
 */

import type { ProjectFile } from './patches.js';

const CLASSIC = ['index.html', 'styles.css', 'script.js'] as const;

function scorePath(path: string, prompt: string): number {
  const p = prompt.toLowerCase();
  const name = path.toLowerCase();
  let score = 0;

  // Explicit path mentions
  if (p.includes(name) || p.includes(name.split('/').pop() || '')) score += 100;

  if (/\.(html?)$/i.test(name) && /\b(html|hero|headline|copy|text|section|page|markup|button label|title)\b/i.test(p)) {
    score += 40;
  }
  if (/\.css$/i.test(name) && /\b(css|style|color|colour|theme|font|layout|spacing|dark|light|background|gradient)\b/i.test(p)) {
    score += 45;
  }
  if (/\.js$/i.test(name) && !/\.json$/i.test(name) && /\b(js|javascript|script|click|toggle|interact|animation|logic|handler|event)\b/i.test(p)) {
    score += 40;
  }
  if (/\.tsx?$/i.test(name) && /\b(react|component|tsx|typescript|hook)\b/i.test(p)) score += 50;
  if (/package\.json$/i.test(name) && /\b(dependenc|package|npm|script)\b/i.test(p)) score += 35;
  if (/readme/i.test(name) && /\breadme\b/i.test(p)) score += 30;

  // Deletes / renames often name the file
  if (/\b(delete|remove|drop)\b/i.test(p) && score >= 100) score += 20;

  // Classic trio baseline for simple site updates
  if (CLASSIC.includes(name as (typeof CLASSIC)[number])) score += 8;

  return score;
}

/**
 * Select files to include with FULL content for the builder update prompt.
 * Always returns at least the classic landing trio when present.
 */
export function selectFilesForUpdate(
  allFiles: ProjectFile[],
  prompt: string,
  opts?: { maxFiles?: number; maxChars?: number },
): { selected: ProjectFile[]; skippedPaths: string[]; reason: string } {
  const maxFiles = opts?.maxFiles ?? 6;
  const maxChars = opts?.maxChars ?? 48_000;

  if (!allFiles.length) {
    return { selected: [], skippedPaths: [], reason: 'no files' };
  }

  const ranked = allFiles
    .map((f) => ({ f, score: scorePath(f.path, prompt) }))
    .sort((a, b) => b.score - a.score || a.f.path.localeCompare(b.f.path));

  const selected: ProjectFile[] = [];
  let chars = 0;
  const picked = new Set<string>();

  // Always include highest-scoring classics if they exist
  for (const classic of CLASSIC) {
    const hit = allFiles.find((f) => f.path === classic || f.path.endsWith(`/${classic}`));
    if (hit && !picked.has(hit.path)) {
      const content = hit.content.slice(0, 24_000);
      selected.push({ path: hit.path, content });
      picked.add(hit.path);
      chars += content.length;
    }
  }

  for (const { f, score } of ranked) {
    if (picked.has(f.path)) continue;
    if (score < 15 && selected.length >= 3) continue;
    if (selected.length >= maxFiles) break;
    const room = maxChars - chars;
    if (room < 400) break;
    const content = f.content.slice(0, Math.min(24_000, room));
    selected.push({ path: f.path, content });
    picked.add(f.path);
    chars += content.length;
  }

  const skippedPaths = allFiles.map((f) => f.path).filter((p) => !picked.has(p));
  const reason =
    skippedPaths.length === 0
      ? `all ${selected.length} files in context`
      : `${selected.length} targeted files (${chars} chars); ${skippedPaths.length} listed by path only`;

  return { selected, skippedPaths, reason };
}

/** Extract likely delete targets from natural language + known paths. */
export function guessDeletePaths(prompt: string, knownPaths: string[]): string[] {
  if (!/\b(delete|remove|drop)\b/i.test(prompt)) return [];
  const hits: string[] = [];
  for (const path of knownPaths) {
    const base = path.split('/').pop() || path;
    if (new RegExp(`\\b${base.replace(/\./g, '\\.')}\\b`, 'i').test(prompt)) {
      hits.push(path);
    }
  }
  // Also catch bare filenames in quotes
  const quoted = prompt.match(/['"`]([^'"`]+\.[a-z0-9]+)['"`]/gi) || [];
  for (const q of quoted) {
    const name = q.replace(/['"`]/g, '');
    const match = knownPaths.find((p) => p === name || p.endsWith(`/${name}`));
    if (match && !hits.includes(match)) hits.push(match);
  }
  return hits.slice(0, 8);
}
