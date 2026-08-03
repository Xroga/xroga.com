import { createHash } from 'node:crypto';

/**
 * Safety rules for SEARCH/REPLACE patches.
 *
 * `applySinglePatch` began with:
 *
 *     if (!search.trim()) return replace;
 *
 * An empty SEARCH against an *existing* file replaced the entire file with the REPLACE
 * body. A model emitting a malformed block — an empty SEARCH is exactly what a
 * truncated response produces — silently wiped whatever was there. The caller's own
 * comment ("used carefully by callers") was the only thing standing between that and
 * data loss.
 *
 * The matching was equally loose: `haystack.includes(search)` then a trimmed retry then
 * an indentation-collapsing retry then a flexible-whitespace regex, each taking the
 * *first* match. A snippet appearing twice would silently patch the wrong one.
 *
 * These rules make both cases refusals instead of guesses.
 */

export type PatchRejection =
  | 'empty_search_on_existing_file'
  | 'search_not_found'
  | 'search_ambiguous'
  | 'stale_source'
  | 'unexpectedly_destructive';

export interface PatchSafetyVerdict {
  ok: boolean;
  rejection?: PatchRejection;
  detail?: string;
  /** How many times the SEARCH matched, when matching ran. */
  matchCount?: number;
}

/** Stable content hash used to detect that a file changed under a patch. */
export function sourceContentHash(content: string): string {
  return createHash('sha256').update(normalizeEol(content), 'utf8').digest('hex');
}

export function normalizeEol(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

/** Counts non-overlapping occurrences of an exact substring. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * The fraction of a file a patch removes.
 *
 * Used to catch the case where a patch that claims to adjust one section actually
 * deletes most of the file — the visible symptom of a truncated REPLACE body.
 */
export function destructionRatio(before: string, after: string): number {
  const beforeLength = normalizeEol(before).length;
  if (beforeLength === 0) return 0;
  const afterLength = normalizeEol(after).length;
  if (afterLength >= beforeLength) return 0;
  return (beforeLength - afterLength) / beforeLength;
}

/**
 * A patch removing more than this share of a file is rejected unless the caller said
 * it was deliberate. Set high enough that ordinary refactors pass and only wholesale
 * truncation trips it.
 */
export const DESTRUCTIVE_RATIO_THRESHOLD = 0.6;

export interface PatchIntent {
  /** The patch explicitly creates a file that must not already exist. */
  isNewFile?: boolean;
  /** The patch explicitly intends a large deletion or a full rewrite. */
  allowDestructive?: boolean;
  /** Hash of the content the patch was authored against, when known. */
  expectedSourceHash?: string;
}

/**
 * Decides whether a patch may be applied to `current`.
 *
 * `current` is `null` for a file that does not exist yet.
 */
export function checkPatchSafety(
  current: string | null,
  search: string,
  intent: PatchIntent = {},
): PatchSafetyVerdict {
  const searchTrimmed = normalizeEol(search).trim();

  if (current === null) {
    // Creating a file is only safe when the patch says that is what it is doing.
    if (!searchTrimmed || intent.isNewFile) return { ok: true };
    return {
      ok: false,
      rejection: 'search_not_found',
      detail: 'The file does not exist and the patch is not marked as creating it.',
    };
  }

  if (!searchTrimmed) {
    // The defect. An empty SEARCH can never mean "replace this whole existing file".
    return {
      ok: false,
      rejection: 'empty_search_on_existing_file',
      detail:
        'An empty SEARCH cannot modify an existing file — this usually means the patch was truncated. ' +
        'Mark the patch as a new file to create one.',
    };
  }

  if (intent.expectedSourceHash) {
    const actual = sourceContentHash(current);
    if (actual !== intent.expectedSourceHash) {
      return {
        ok: false,
        rejection: 'stale_source',
        detail: 'The file changed after this patch was written, so it was not applied.',
      };
    }
  }

  const matches = countOccurrences(normalizeEol(current), normalizeEol(search));
  if (matches > 1) {
    // Previously the first match won silently, patching an arbitrary occurrence.
    return {
      ok: false,
      rejection: 'search_ambiguous',
      detail: `SEARCH matched ${matches} times; it must match exactly once to be unambiguous.`,
      matchCount: matches,
    };
  }

  // Zero *exact* matches is not a rejection on its own: a patch may still match once
  // after normalising indentation or whitespace, which is legitimate and long-supported.
  // That path is not waved through — `applySinglePatch` requires the flexible match to
  // be unique too, and returns null otherwise. Rejecting here instead would break
  // ordinary reindented patches while adding no safety the applier does not already
  // provide.
  return { ok: true, matchCount: matches };
}

/** Checks the result of an applied patch before it is accepted. */
export function checkPatchResult(
  before: string,
  after: string,
  intent: PatchIntent = {},
): PatchSafetyVerdict {
  if (intent.allowDestructive) return { ok: true };
  const ratio = destructionRatio(before, after);
  if (ratio > DESTRUCTIVE_RATIO_THRESHOLD) {
    return {
      ok: false,
      rejection: 'unexpectedly_destructive',
      detail: `This patch would remove ${Math.round(ratio * 100)}% of the file without asking to.`,
    };
  }
  return { ok: true };
}

/** One readable line per rejection, for the run transcript. */
export function describePatchRejection(rejection: PatchRejection, path: string): string {
  switch (rejection) {
    case 'empty_search_on_existing_file':
      return `${path}: patch had an empty SEARCH against an existing file — refused to overwrite it.`;
    case 'search_not_found':
      return `${path}: the text the patch expected to find is not in the file.`;
    case 'search_ambiguous':
      return `${path}: the patch matched more than one place, so it was not applied.`;
    case 'stale_source':
      return `${path}: the file changed after the patch was written, so it was not applied.`;
    case 'unexpectedly_destructive':
      return `${path}: the patch would have deleted most of the file, so it was not applied.`;
  }
}
