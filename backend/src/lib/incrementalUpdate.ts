/**
 * Targeted update mode — only load & edit files the user mentioned.
 * Saves tokens vs full hackathon rebuild pipeline.
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

const PATH_IN_PROMPT = /\b([\w.-]+\/(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|css|html|json|py|go|rs|vue|svelte))\b/gi;

const UI_KEYWORDS =
  /\b(ui|ux|button|color|theme|style|layout|font|hero|navbar|nav|menu|mobile|responsive|dark mode|animation|polish|design)\b/i;

const LOGIC_KEYWORDS =
  /\b(api|endpoint|fetch|bug|error|fix|login|auth|integration|webhook|database|handler|function|submit|form)\b/i;

/** Map user language to likely file paths (hackathon + static sites). */
export function inferPathsFromUpdatePrompt(prompt: string, treePaths: string[]): string[] {
  const t = prompt.toLowerCase();
  const paths = new Set<string>();

  let match: RegExpExecArray | null;
  const re = new RegExp(PATH_IN_PROMPT.source, 'gi');
  while ((match = re.exec(prompt)) !== null) {
    paths.add(match[1]!);
  }

  if (/\b(index|html|page|section|header|footer|hero)\b/i.test(t)) paths.add('index.html');
  if (/\b(css|style|theme|color|font|layout)\b/i.test(t)) paths.add('styles.css');
  if (/\b(js|script|button|click|handler|api|fetch|logic)\b/i.test(t)) paths.add('script.js');

  if (treePaths.length) {
    if (/\breact|tsx|component\b/i.test(t)) {
      for (const p of treePaths) {
        if (/\.(tsx|jsx)$/.test(p) && /component|app|page/i.test(p)) paths.add(p);
      }
    }
    if (/\bapi\b/i.test(t)) {
      for (const p of treePaths) {
        if (/api\/|routes\/|server\./i.test(p)) paths.add(p);
      }
    }
  }

  if (!paths.size) {
    paths.add('index.html');
    if (UI_KEYWORDS.test(t)) paths.add('styles.css');
    if (LOGIC_KEYWORDS.test(t)) paths.add('script.js');
  }

  return [...paths].slice(0, 12);
}

export function planIncrementalUpdate(prompt: string, treePaths: string[] = []): UpdateTargetPlan {
  const filePaths = new Set(inferPathsFromUpdatePrompt(prompt, treePaths));
  const touchesUi = UI_KEYWORDS.test(prompt) || [...filePaths].some((p) => /\.(css|html|tsx|jsx|vue)$/i.test(p));
  const touchesLogic = LOGIC_KEYWORDS.test(prompt) || [...filePaths].some((p) => /\.(js|ts|py|go)$/i.test(p));

  const labels: string[] = [];
  if (touchesUi) labels.push('UI/UX — targeted files only');
  if (touchesLogic) labels.push('Logic/API — targeted files only');
  if (!labels.length) labels.push('Patch — user-requested files only');

  const stepCount: 1 | 2 =
    filePaths.size <= 2 && !touchesUi && !touchesLogic ? 1 : touchesUi && touchesLogic ? 2 : 1;

  return { labels, filePaths, touchesUi, touchesLogic, stepCount };
}

export function formatFilesForUpdateContext(files: ProjectFile[], maxCharsPerFile = 24_000): string {
  const parts: string[] = [
    'TARGET FILES ONLY — edit these paths; do NOT modify any other file in the repo.',
  ];
  for (const f of files) {
    const content = f.content.length > maxCharsPerFile ? `${f.content.slice(0, maxCharsPerFile)}\n/* …truncated */` : f.content;
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
