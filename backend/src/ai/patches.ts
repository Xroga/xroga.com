/**
 * Surgical search/replace patch helpers for incremental project updates.
 */

export interface FilePatch {
  path: string;
  search: string;
  replace: string;
}

/** Explicit file deletion requested by the model */
export interface FileDelete {
  path: string;
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
const DELETE_FILE_RE = /\*\*\*\s*Delete File:\s*([^\n*]+)/gi;

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
    if (!raw.includes('"patches"') && !raw.includes('"deletes"')) continue;
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

/** Parse `*** Delete File: path` and JSON `{ "deletes": ["a.js"] }`. */
export function extractDeletePaths(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    const p = path.trim().replace(/^\.\//, '');
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  for (const match of text.matchAll(DELETE_FILE_RE)) {
    add(match[1]);
  }

  for (const match of text.matchAll(JSON_FENCE_RE)) {
    const raw = match[1].trim();
    if (!raw.includes('"deletes"')) continue;
    try {
      const parsed = JSON.parse(raw) as { deletes?: unknown };
      if (!Array.isArray(parsed.deletes)) continue;
      for (const d of parsed.deletes) {
        if (typeof d === 'string') add(d);
        else if (d && typeof d === 'object' && typeof (d as { path?: string }).path === 'string') {
          add((d as { path: string }).path);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}

/** Remove deleted paths from a file set. */
export function applyDeletes(
  files: ProjectFile[],
  deletePaths: string[],
): { files: ProjectFile[]; deleted: string[] } {
  if (!deletePaths.length) return { files, deleted: [] };
  const del = new Set(deletePaths.map((p) => p.replace(/^\.\//, '')));
  const deleted = files.map((f) => f.path).filter((p) => del.has(p));
  return {
    files: files.filter((f) => !del.has(f.path)),
    deleted,
  };
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

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

function applySinglePatch(content: string, patch: FilePatch): string | null {
  const haystack = normalizeEol(content);
  const search = normalizeEol(patch.search);
  const replace = normalizeEol(patch.replace);

  // Empty SEARCH on existing file → append; used carefully by callers for new files
  if (!search.trim()) {
    return replace;
  }

  if (haystack.includes(search)) {
    return haystack.replace(search, replace);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch && trimmedSearch !== search && haystack.includes(trimmedSearch)) {
    return haystack.replace(trimmedSearch, replace);
  }

  // Indentation-tolerant: collapse leading spaces per line
  const collapseIndent = (s: string) =>
    s
      .split('\n')
      .map((line) => line.replace(/^\s+/, ''))
      .join('\n');
  const collapsedHay = collapseIndent(haystack);
  const collapsedSearch = collapseIndent(search);
  if (collapsedSearch.trim() && collapsedHay.includes(collapsedSearch)) {
    // Map back by finding first line of search in original
    const firstLine = search.split('\n').map((l) => l.trim()).find(Boolean);
    if (firstLine) {
      const idx = haystack.indexOf(firstLine);
      if (idx >= 0) {
        // Best-effort: replace first occurrence of flexible whitespace match
        const flex = flexibleWhitespacePattern(search);
        if (flex) {
          const match = haystack.match(flex);
          if (match) return haystack.replace(match[0], replace);
        }
      }
    }
  }

  const flex = flexibleWhitespacePattern(search);
  if (flex) {
    const match = haystack.match(flex);
    if (match) {
      return haystack.replace(match[0], replace);
    }
  }

  return null;
}

export interface ApplyPatchesResult {
  files: ProjectFile[];
  applied: FilePatch[];
  failed: FilePatch[];
  /** Human-readable reasons for failed patches (same order as failed) */
  failureReasons: string[];
  createdPaths: string[];
}

/**
 * Apply patches to project files. Failed patches leave files unchanged.
 * Empty SEARCH + missing path creates a new file (safe additive update).
 */
export function applyPatches(
  files: ProjectFile[],
  patches: FilePatch[],
): ApplyPatchesResult {
  const byPath = new Map(files.map((f) => [f.path.replace(/^\.\//, ''), f.content]));
  const applied: FilePatch[] = [];
  const failed: FilePatch[] = [];
  const failureReasons: string[] = [];
  const createdPaths: string[] = [];

  for (const patch of patches) {
    const path = patch.path.replace(/^\.\//, '');
    const normalizedPatch = { ...patch, path };
    const current = byPath.get(path);

    // Create new file when SEARCH is empty / placeholder and path missing
    if (current === undefined) {
      const searchTrim = normalizeEol(patch.search).trim();
      if (!searchTrim || searchTrim === '<<NEW FILE>>' || searchTrim === '(new file)') {
        byPath.set(path, normalizeEol(patch.replace));
        applied.push(normalizedPatch);
        createdPaths.push(path);
        continue;
      }
      failed.push(normalizedPatch);
      failureReasons.push(`missing file: ${path}`);
      continue;
    }

    const next = applySinglePatch(current, normalizedPatch);
    if (next === null) {
      failed.push(normalizedPatch);
      failureReasons.push(`SEARCH not found in ${path}`);
      continue;
    }

    byPath.set(path, next);
    applied.push(normalizedPatch);
  }

  const paths = new Set([...files.map((f) => f.path.replace(/^\.\//, '')), ...byPath.keys()]);
  return {
    files: [...paths].map((path) => ({ path, content: byPath.get(path) ?? '' })),
    applied,
    failed,
    failureReasons,
    createdPaths,
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
