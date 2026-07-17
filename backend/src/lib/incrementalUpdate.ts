/**
 * Targeted update mode — only load & edit files the user mentioned.
 * Plan A: fetch → patch → push; never full scaffold unless forced rebuild.
 */

import type { ProjectFile } from '../services/integrations/githubDeploy.js';

export interface UpdateTargetPlan {
  /** Human labels for activity log */
  labels: string[];
  /** Repo paths to fetch and include in LLM context */
  filePaths: Set<string>;
  /** UI-related (use Grok + light Sonnet) */
  touchesUi: boolean;
  /** API / logic (DeepSeek Flash/Pro only) */
  touchesLogic: boolean;
  /** Single-step update when scope is narrow */
  stepCount: 1 | 2;
}

export interface FileTrailDiff {
  path: string;
  before: string;
  after: string;
  added: number;
  removed: number;
}

/** Path with folders, or bare filename with a known extension. */
const PATH_IN_PROMPT =
  /\b((?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|css|scss|html|json|md|py|go|rs|vue|svelte|mjs|cjs))\b/gi;

const UI_KEYWORDS =
  /\b(ui|ux|button|color|theme|style|layout|font|hero|navbar|nav|menu|mobile|responsive|dark\s*mode|night\s*mode|day\s*mode|light\s*mode|animation|polish|design|palette|brand)\b/i;

const LOGIC_KEYWORDS =
  /\b(api|endpoint|fetch|bug|error|fix|broken|login|auth|integration|webhook|database|handler|function|submit|form|toggle|click)\b/i;

const DARK_MODE =
  /\b(dark\s*mode|night\s*mode|day\s*mode|light\s*mode|theme\s*toggle|color\s*scheme|prefers-color-scheme)\b/i;

const COLOR_CHANGE =
  /\b(color|colour|palette|brand|primary|accent|background|bg)\b[\s\S]{0,40}\b(to|into|with|#|[a-z]+)\b/i;

const BROKEN_CONTROL =
  /\b(broken|doesn'?t\s+work|not\s+working|fix|bug|repair|click\s+doesn'?t|button\s+is\s+broken)\b/i;

const NEW_SECTION =
  /\b(add|create|new)\b[\s\S]{0,40}\b(section|page|feature|newsletter|footer|gallery|modal|form|faq)\b/i;

const DELETE_INTENT =
  /\b(delete|remove|drop|erase|unlink)\b[\s\S]{0,60}\b([\w./-]+\.\w+|file|component|page|section)\b/i;

const EDIT_INTENT =
  /\b(edit|update|change|modify|fix|rewrite|patch|replace)\b[\s\S]{0,80}\b([\w./-]+\.\w+|file|component|page|section|header|footer|hero)\b/i;

/** Resolve bare filenames (e.g. page.tsx) against the repo tree. */
function resolveAgainstTree(candidate: string, treePaths: string[]): string[] {
  const clean = candidate.replace(/^\.\//, '').replace(/^\//, '');
  if (!clean) return [];
  if (treePaths.includes(clean)) return [clean];
  const base = clean.includes('/') ? clean.split('/').pop()! : clean;
  const hits = treePaths.filter((p) => p === clean || p.endsWith(`/${base}`) || p.endsWith(clean));
  return hits.slice(0, 4);
}

/** User explicitly asks to rebuild entire site from scratch. */
export function isForcedFullRebuild(prompt: string): boolean {
  const t = prompt.toLowerCase();
  return (
    /\b(rebuild|regenerate|recreate|start\s+over|from\s+scratch)\b[\s\S]{0,40}\b(site|website|app|project|everything|entire)\b/.test(
      t
    ) || /\b(full\s+rebuild|complete\s+rebuild|nuke\s+and\s+pave)\b/.test(t)
  );
}

/** User explicitly asks to read/fix entire codebase — escalate model chain. */
export function isForcedFullRepoFix(prompt: string): boolean {
  const t = prompt.toLowerCase();
  return (
    /\b(read|analyze|scan|audit|review)\b[\s\S]{0,40}\b(all|every|entire|whole|full)\b[\s\S]{0,40}\b(file|repo|code|codebase|project)\b/.test(
      t
    ) ||
    /\b(fix|correct|repair)\b[\s\S]{0,30}\b(everything|all bugs|all errors|entire app|whole site)\b/.test(t) ||
    /\bforce\b[\s\S]{0,20}\b(read|fix|correct)\b/.test(t) ||
    isForcedFullRebuild(prompt)
  );
}

/** Updates must never full-scaffold unless user forced a rebuild. */
export function shouldAllowFullScaffoldOnUpdate(prompt: string): boolean {
  return isForcedFullRebuild(prompt);
}

/** Map user language to likely file paths (hackathon + static sites + common app trees). */
export function inferPathsFromUpdatePrompt(prompt: string, treePaths: string[]): string[] {
  const t = prompt.toLowerCase();
  const paths = new Set<string>();
  const addResolved = (candidate: string) => {
    const resolved = treePaths.length ? resolveAgainstTree(candidate, treePaths) : [candidate];
    // When we know the real tree, never invent paths that do not exist (stops fake triad files).
    if (treePaths.length && !resolved.length) return;
    for (const p of resolved.length ? resolved : [candidate]) paths.add(p);
  };

  let match: RegExpExecArray | null;
  const re = new RegExp(PATH_IN_PROMPT.source, 'gi');
  while ((match = re.exec(prompt)) !== null) {
    addResolved(match[1]!);
  }

  if (DELETE_INTENT.test(prompt) || EDIT_INTENT.test(prompt)) {
    const named = prompt.match(
      /\b(?:delete|remove|drop|erase|edit|update|change|modify|fix|rewrite|patch|replace)\b[\s\S]{0,80}?\b((?:[\w.-]+\/)*[\w.-]+\.\w+)\b/i
    );
    if (named?.[1]) addResolved(named[1]);
  }

  if (/\b(index|html|page|section|header|footer|hero)\b/i.test(t) || NEW_SECTION.test(t)) {
    addResolved('index.html');
  }
  if (/\b(css|style|theme|color|font|layout)\b/i.test(t) || DARK_MODE.test(t) || COLOR_CHANGE.test(t)) {
    addResolved('styles.css');
  }
  if (
    /\b(js|script|button|click|handler|api|fetch|logic|toggle)\b/i.test(t) ||
    DARK_MODE.test(t) ||
    BROKEN_CONTROL.test(t)
  ) {
    addResolved('script.js');
  }

  if (treePaths.length) {
    const pick = (pred: (p: string) => boolean, limit = 4) => {
      for (const p of treePaths) {
        if (pred(p)) {
          paths.add(p);
          if ([...paths].filter(pred).length >= limit) break;
        }
      }
    };

    if (DARK_MODE.test(t) || COLOR_CHANGE.test(t)) {
      pick((p) => /theme|globals?\.(css|scss)|tailwind|styles?\./i.test(p));
    }
    if (/\breact|tsx|component\b/i.test(t) || NEW_SECTION.test(t) || EDIT_INTENT.test(prompt)) {
      pick((p) => /\.(tsx|jsx)$/.test(p) && /component|app|page|layout/i.test(p));
    }
    if (/\bapi\b/i.test(t)) {
      pick((p) => /api\/|routes\/|server\./i.test(p));
    }
    if (BROKEN_CONTROL.test(t) || EDIT_INTENT.test(prompt)) {
      pick((p) => /\.(html|js|tsx|jsx)$/.test(p) && /index|app|page|main|script/i.test(p), 3);
    }
    if (DELETE_INTENT.test(prompt) && paths.size === 0) {
      pick((p) => /\.(md|txt|html)$/i.test(p) && /readme|todo|temp|draft/i.test(p), 2);
    }
  }

  if (!paths.size) {
    // Prefer real tree entrypoints over inventing triad paths for Next/app repos
    if (treePaths.length) {
      const entry =
        treePaths.find((p) => p === 'index.html') ||
        treePaths.find((p) => /(?:^|\/)app\/page\.(tsx|jsx|js)$/i.test(p)) ||
        treePaths.find((p) => /(?:^|\/)src\/app\/page\.(tsx|jsx|js)$/i.test(p)) ||
        treePaths.find((p) => /(?:^|\/)pages\/index\.(tsx|jsx|js)$/i.test(p));
      if (entry) paths.add(entry);
      else {
        paths.add('index.html');
        paths.add('styles.css');
        paths.add('script.js');
      }
    } else {
      paths.add('index.html');
      if (UI_KEYWORDS.test(t)) paths.add('styles.css');
      if (LOGIC_KEYWORDS.test(t)) paths.add('script.js');
      if (!UI_KEYWORDS.test(t) && !LOGIC_KEYWORDS.test(t)) {
        paths.add('styles.css');
        paths.add('script.js');
      }
    }
  }

  return [...paths].slice(0, 12);
}

/** Paths the user explicitly asked to delete from the repo. */
export function inferDeletePathsFromPrompt(prompt: string, treePaths: string[]): string[] {
  if (!DELETE_INTENT.test(prompt)) return [];
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PATH_IN_PROMPT.source, 'gi');
  while ((match = re.exec(prompt)) !== null) {
    for (const p of resolveAgainstTree(match[1]!, treePaths.length ? treePaths : [match[1]!])) {
      out.add(p);
    }
  }
  return [...out].slice(0, 8);
}

export function planIncrementalUpdate(prompt: string, treePaths: string[] = []): UpdateTargetPlan {
  const filePaths = new Set(inferPathsFromUpdatePrompt(prompt, treePaths));
  for (const del of inferDeletePathsFromPrompt(prompt, treePaths)) {
    filePaths.add(del);
  }
  const touchesUi =
    UI_KEYWORDS.test(prompt) ||
    DARK_MODE.test(prompt) ||
    COLOR_CHANGE.test(prompt) ||
    [...filePaths].some((p) => /\.(css|html|tsx|jsx|vue)$/i.test(p));
  const touchesLogic =
    LOGIC_KEYWORDS.test(prompt) ||
    BROKEN_CONTROL.test(prompt) ||
    DARK_MODE.test(prompt) ||
    [...filePaths].some((p) => /\.(js|ts|py|go)$/i.test(p));

  const labels: string[] = [];
  if (DELETE_INTENT.test(prompt)) labels.push('Delete — remove named files');
  if (DARK_MODE.test(prompt)) labels.push('Theme — dark/light toggle');
  else if (COLOR_CHANGE.test(prompt)) labels.push('Theme — colors only');
  else if (BROKEN_CONTROL.test(prompt)) labels.push('Fix — broken control');
  else if (NEW_SECTION.test(prompt)) labels.push('Feature — new section');
  else if (EDIT_INTENT.test(prompt) && !labels.length) labels.push('Edit — exact file patches');
  if (touchesUi && !labels.length) labels.push('UI/UX — targeted files only');
  if (touchesLogic && !labels.some((l) => /Fix|Feature|Theme|Edit|Delete/.test(l))) {
    labels.push('Logic/API — targeted files only');
  }
  if (!labels.length) labels.push('Patch — user-requested files only');

  const stepCount: 1 | 2 =
    filePaths.size <= 2 && !(touchesUi && touchesLogic) ? 1 : touchesUi && touchesLogic ? 2 : 1;

  return { labels, filePaths, touchesUi, touchesLogic, stepCount };
}

export function formatFilesForUpdateContext(files: ProjectFile[], maxCharsPerFile = 24_000): string {
  const parts: string[] = [
    'TARGET FILES ONLY — edit these paths; do NOT modify any other file in the repo.',
  ];
  for (const f of files) {
    const content =
      f.content.length > maxCharsPerFile
        ? `${f.content.slice(0, maxCharsPerFile)}\n/* …truncated */`
        : f.content;
    parts.push(`--- ${f.path} ---\n${content}`);
  }
  return parts.join('\n\n');
}

export function mergePatchedFiles(
  original: ProjectFile[],
  patchedBlocks: ProjectFile[]
): ProjectFile[] {
  const map = new Map(original.map((f) => [f.path, f.content]));
  for (const p of patchedBlocks) {
    if (p.content?.trim()) map.set(p.path, p.content);
  }
  return [...map.entries()].map(([path, content]) => ({ path, content }));
}

const FENCE_WITH_PATH = /```([^\n`]+)\n([\s\S]*?)```/g;

function normalizeFencePathLabel(label: string, allowedPaths: Set<string>): string | null {
  const raw = label.trim().replace(/^\//, '');
  // ```DELETE path/to/file.tsx``` or ```delete: path```
  const deleteMatch = raw.match(/^(?:DELETE|delete)\s*:?\s*(.+)$/);
  if (deleteMatch?.[1]) {
    const p = deleteMatch[1].trim().replace(/^\//, '');
    return allowedPaths.has(p) ? p : null;
  }
  // ```tsx path/to/File.tsx``` / ```typescript:src/app.ts```
  const langPath = raw.match(
    /^(?:tsx?|jsx?|javascript|typescript|css|scss|html|json|markdown|md|python|py|go|rust|vue|svelte)\s*:?\s+([\w./-]+\.\w+)$/i
  );
  if (langPath?.[1]) {
    const p = langPath[1].replace(/^\//, '');
    return allowedPaths.has(p) ? p : null;
  }
  if (/^[\w./-]+\.\w+$/.test(raw) && allowedPaths.has(raw)) return raw;
  // Basename match against allowed set
  if (/^[\w.-]+\.\w+$/.test(raw)) {
    const hit = [...allowedPaths].find((p) => p === raw || p.endsWith(`/${raw}`));
    if (hit) return hit;
  }
  if (/^(html|htm)$/i.test(raw) && allowedPaths.has('index.html')) return 'index.html';
  if (/^css$/i.test(raw) && allowedPaths.has('styles.css')) return 'styles.css';
  if (/^(javascript|js)$/i.test(raw) && allowedPaths.has('script.js')) return 'script.js';
  return null;
}

/** Pull only paths the user asked to change from swarm step output. */
export function extractPatchedFilesFromAssembly(
  assembledCode: string,
  allowedPaths: Set<string>
): ProjectFile[] {
  const patched: ProjectFile[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const re = new RegExp(FENCE_WITH_PATH.source, 'g');
  while ((match = re.exec(assembledCode)) !== null) {
    const label = match[1]!.trim();
    const content = match[2]!.trim();
    const path = normalizeFencePathLabel(label, allowedPaths);
    if (!path || seen.has(path)) continue;
    const isDelete = /^(?:DELETE|delete)\b/i.test(label);
    // Empty fences only count when explicitly labeled DELETE
    if (!content && !isDelete) continue;
    if (isDelete) continue; // handled by extractDeletedPathsFromAssembly
    seen.add(path);
    patched.push({ path, content });
  }

  return patched;
}

/** Paths marked for deletion in assembly (DELETE fences or empty path fences). */
export function extractDeletedPathsFromAssembly(
  assembledCode: string,
  allowedPaths: Set<string>
): string[] {
  const deleted: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(FENCE_WITH_PATH.source, 'g');
  while ((match = re.exec(assembledCode)) !== null) {
    const label = match[1]!.trim();
    const content = match[2]!.trim();
    if (!/^(?:DELETE|delete)\b/i.test(label) && content.length > 0) continue;
    const path = normalizeFencePathLabel(label, allowedPaths);
    if (path && !seen.has(path)) {
      seen.add(path);
      deleted.push(path);
    }
  }
  return deleted;
}

/** Map landing output (html/css/js) onto repo paths for incremental GitHub push. */
export function landingOutputToPatchedFiles(
  html: string,
  css: string,
  js: string,
  allowedPaths: Set<string>
): ProjectFile[] {
  const out: ProjectFile[] = [];
  if (allowedPaths.has('index.html') && html?.trim()) out.push({ path: 'index.html', content: html });
  if (allowedPaths.has('styles.css') && css?.trim()) out.push({ path: 'styles.css', content: css });
  if (allowedPaths.has('script.js') && js?.trim()) out.push({ path: 'script.js', content: js });
  return out;
}

function countLineDelta(before: string, after: string): { added: number; removed: number } {
  const a = before.split('\n');
  const b = after.split('\n');
  // Approximate: prefer length delta when sets differ a lot
  const added = Math.max(0, b.length - a.length);
  const removed = Math.max(0, a.length - b.length);
  if (added === 0 && removed === 0 && before !== after) {
    let changed = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) changed++;
    return { added: changed, removed: changed };
  }
  return { added: added || (before !== after ? 1 : 0), removed };
}

/** Build expandable file trail diffs for the terminal (Plan A). */
export function buildFileTrailDiffs(
  beforeFiles: ProjectFile[],
  afterFiles: ProjectFile[]
): FileTrailDiff[] {
  const beforeMap = new Map(beforeFiles.map((f) => [f.path, f.content]));
  const trails: FileTrailDiff[] = [];
  for (const after of afterFiles) {
    const before = beforeMap.get(after.path) ?? '';
    if (before === after.content) continue;
    const { added, removed } = countLineDelta(before, after.content);
    trails.push({
      path: after.path,
      before,
      after: after.content,
      added,
      removed,
    });
  }
  return trails;
}

export function shortChangeSummary(prompt: string, paths: string[]): string[] {
  const bullets: string[] = [];
  if (DELETE_INTENT.test(prompt)) bullets.push('Removed requested file(s) from the repo');
  if (DARK_MODE.test(prompt)) bullets.push('Added or wired dark/light theme toggle');
  if (COLOR_CHANGE.test(prompt)) bullets.push('Updated brand / theme colors');
  if (BROKEN_CONTROL.test(prompt)) bullets.push('Fixed broken control / interaction');
  if (NEW_SECTION.test(prompt)) bullets.push('Added requested section / feature');
  if (!bullets.length) bullets.push(`Patched ${paths.length} file(s) in place`);
  bullets.push(paths.length ? `Files: ${paths.slice(0, 5).join(', ')}` : 'No extra files regenerated');
  bullets.push('No full site rebuild');
  return bullets.slice(0, 3);
}

/** Honest summary from real before/after diffs — prefer over keyword cosmetics. */
export function changeSummaryFromFileTrail(
  trail: FileTrailDiff[],
  deletedPaths: string[] = []
): string[] {
  const bullets: string[] = [];
  for (const d of deletedPaths.slice(0, 3)) {
    bullets.push(`Deleted ${d}`);
  }
  for (const t of trail.slice(0, 5)) {
    if (deletedPaths.includes(t.path)) continue;
    if (!t.before?.trim()) bullets.push(`Created ${t.path} (+${t.added} lines)`);
    else bullets.push(`Updated ${t.path} (+${t.added}/−${t.removed})`);
  }
  if (!bullets.length) bullets.push('No file content changed on disk');
  bullets.push('Targeted patch — not a full rebuild');
  return bullets.slice(0, 6);
}
