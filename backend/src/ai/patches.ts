/**
 * Surgical search/replace patch helpers for incremental project updates.
 */

export interface FilePatch {
  path: string;
  search: string;
  replace: string;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface FileTrailEntry {
  path: string;
  before: string;
  after: string;
  added: number;
  removed: number;
}

/** Merge-safe delimiters (preferred). Also accept legacy git-conflict-style markers. */
const PATCH_BLOCK_RE =
  /\*\*\*\s*Update File:\s*(.+?)\s*\n(?:<<<SEARCH|<<<<<<< SEARCH)\n([\s\S]*?)\n(?:===|=======)\n([\s\S]*?)\n(?:>>>REPLACE|>>>>>>> REPLACE)/g;

const JSON_FENCE_RE = /```json\s*([\s\S]*?)```/gi;

/**
 * Parse SEARCH/REPLACE patch blocks or a JSON `{ patches: [...] }` fence.
 */
export function extractSearchReplacePatches(text: string): FilePatch[] {
  const patches: FilePatch[] = [];
  const seen = new Set<string>();

  const add = (path: string, search: string, replace: string) => {
    const key = `${path}\0${search}\0${replace}`;
    if (seen.has(key)) return;
    seen.add(key);
    patches.push({ path: path.trim(), search, replace });
  };

  for (const match of text.matchAll(PATCH_BLOCK_RE)) {
    add(match[1], match[2], match[3]);
  }

  for (const match of text.matchAll(JSON_FENCE_RE)) {
    const raw = match[1].trim();
    if (!raw.includes('"patches"')) continue;
    try {
      const parsed = JSON.parse(raw) as { patches?: Array<Partial<FilePatch>> };
      if (!Array.isArray(parsed.patches)) continue;
      for (const p of parsed.patches) {
        if (typeof p.path === 'string' && typeof p.search === 'string' && typeof p.replace === 'string') {
          add(p.path, p.search, p.replace);
        }
      }
    } catch {
      // ignore malformed JSON fences
    }
  }

  return patches;
}

function flexibleWhitespacePattern(search: string): RegExp | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/).map((part) =>
    part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  if (parts.length < 2) return null;

  const pattern = parts.join('\\s+');
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function applySinglePatch(content: string, patch: FilePatch): string | null {
  if (content.includes(patch.search)) {
    return content.replace(patch.search, patch.replace);
  }

  const trimmedSearch = patch.search.trim();
  if (trimmedSearch && trimmedSearch !== patch.search && content.includes(trimmedSearch)) {
    return content.replace(trimmedSearch, patch.replace);
  }

  const flex = flexibleWhitespacePattern(patch.search);
  if (flex) {
    const match = content.match(flex);
    if (match) {
      return content.replace(match[0], patch.replace);
    }
  }

  return null;
}

/**
 * Apply patches to project files. Failed patches leave files unchanged.
 */
export function applyPatches(
  files: ProjectFile[],
  patches: FilePatch[],
): { files: ProjectFile[]; applied: FilePatch[]; failed: FilePatch[] } {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const applied: FilePatch[] = [];
  const failed: FilePatch[] = [];

  for (const patch of patches) {
    const current = byPath.get(patch.path);
    if (current === undefined) {
      failed.push(patch);
      continue;
    }

    const next = applySinglePatch(current, patch);
    if (next === null) {
      failed.push(patch);
      continue;
    }

    byPath.set(patch.path, next);
    applied.push(patch);
  }

  return {
    files: files.map((f) => ({ path: f.path, content: byPath.get(f.path) ?? f.content })),
    applied,
    failed,
  };
}

/** Count lines added and removed between two file snapshots. */
export function lineDiffCounts(before: string, after: string): { added: number; removed: number } {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  let added = 0;
  let removed = 0;
  const maxLen = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLen; i++) {
    const prev = beforeLines[i];
    const next = afterLines[i];
    if (prev === next) continue;
    if (prev === undefined) {
      added++;
    } else if (next === undefined) {
      removed++;
    } else if (next.includes(prev) || prev.includes(next)) {
      added++;
    } else {
      removed++;
      added++;
    }
  }

  return { added, removed };
}

/** Build per-file trail entries for changed files. */
export function buildFileTrail(previous: ProjectFile[], next: ProjectFile[]): FileTrailEntry[] {
  const prevMap = new Map(previous.map((f) => [f.path, f.content]));
  const nextMap = new Map(next.map((f) => [f.path, f.content]));
  const paths = new Set([...prevMap.keys(), ...nextMap.keys()]);
  const trail: FileTrailEntry[] = [];

  for (const path of paths) {
    const before = prevMap.get(path) ?? '';
    const after = nextMap.get(path) ?? '';
    if (before === after) continue;
    const { added, removed } = lineDiffCounts(before, after);
    trail.push({ path, before, after, added, removed });
  }

  return trail.sort((a, b) => a.path.localeCompare(b.path));
}
