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

const PATH_IN_PROMPT = /\b([\w.-]+\/(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|css|html|json|py|go|rs|vue|svelte))\b/gi;

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

  let match: RegExpExecArray | null;
  const re = new RegExp(PATH_IN_PROMPT.source, 'gi');
  while ((match = re.exec(prompt)) !== null) {
    paths.add(match[1]!);
  }

  if (/\b(index|html|page|section|header|footer|hero)\b/i.test(t) || NEW_SECTION.test(t)) {
    paths.add('index.html');
  }
  if (/\b(css|style|theme|color|font|layout)\b/i.test(t) || DARK_MODE.test(t) || COLOR_CHANGE.test(t)) {
    paths.add('styles.css');
  }
  if (
    /\b(js|script|button|click|handler|api|fetch|logic|toggle)\b/i.test(t) ||
    DARK_MODE.test(t) ||
    BROKEN_CONTROL.test(t)
  ) {
    paths.add('script.js');
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
    if (/\breact|tsx|component\b/i.test(t) || NEW_SECTION.test(t)) {
      pick((p) => /\.(tsx|jsx)$/.test(p) && /component|app|page|layout/i.test(p));
    }
    if (/\bapi\b/i.test(t)) {
      pick((p) => /api\/|routes\/|server\./i.test(p));
    }
    if (BROKEN_CONTROL.test(t)) {
      pick((p) => /\.(html|js|tsx|jsx)$/.test(p) && /index|app|page|main|script/i.test(p), 3);
    }
  }

  if (!paths.size) {
    paths.add('index.html');
    if (UI_KEYWORDS.test(t)) paths.add('styles.css');
    if (LOGIC_KEYWORDS.test(t)) paths.add('script.js');
    if (!UI_KEYWORDS.test(t) && !LOGIC_KEYWORDS.test(t)) {
      paths.add('styles.css');
      paths.add('script.js');
    }
  }

  return [...paths].slice(0, 12);
}

export function planIncrementalUpdate(prompt: string, treePaths: string[] = []): UpdateTargetPlan {
  const filePaths = new Set(inferPathsFromUpdatePrompt(prompt, treePaths));
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
  if (DARK_MODE.test(prompt)) labels.push('Theme — dark/light toggle');
  else if (COLOR_CHANGE.test(prompt)) labels.push('Theme — colors only');
  else if (BROKEN_CONTROL.test(prompt)) labels.push('Fix — broken control');
  else if (NEW_SECTION.test(prompt)) labels.push('Feature — new section');
  if (touchesUi && !labels.length) labels.push('UI/UX — targeted files only');
  if (touchesLogic && !labels.some((l) => /Fix|Feature|Theme/.test(l))) {
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
    if (!content) continue;

    let path: string | null = null;
    if (/^[\w./-]+\.\w+$/.test(label) && allowedPaths.has(label.replace(/^\//, ''))) {
      path = label.replace(/^\//, '');
    } else if (/^(html|htm)$/i.test(label) && allowedPaths.has('index.html')) {
      path = 'index.html';
    } else if (/^css$/i.test(label) && allowedPaths.has('styles.css')) {
      path = 'styles.css';
    } else if (/^(javascript|js)$/i.test(label) && allowedPaths.has('script.js')) {
      path = 'script.js';
    }

    if (path && !seen.has(path)) {
      seen.add(path);
      patched.push({ path, content });
    }
  }

  return patched;
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
  if (DARK_MODE.test(prompt)) bullets.push('Added or wired dark/light theme toggle');
  if (COLOR_CHANGE.test(prompt)) bullets.push('Updated brand / theme colors');
  if (BROKEN_CONTROL.test(prompt)) bullets.push('Fixed broken control / interaction');
  if (NEW_SECTION.test(prompt)) bullets.push('Added requested section / feature');
  if (!bullets.length) bullets.push(`Patched ${paths.length} file(s) in place`);
  bullets.push(paths.length ? `Files: ${paths.slice(0, 5).join(', ')}` : 'No extra files regenerated');
  bullets.push('No full site rebuild');
  return bullets.slice(0, 3);
}
