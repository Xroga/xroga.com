import type { ProjectFile } from '../ai/patches.js';

/**
 * Revision diff. Bounded by construction so a large or hostile project cannot make a history view
 * expensive: files beyond the cap are summarised by count only, and each file's patch is truncated.
 */

export interface FileDiff {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted';
  readonly additions: number;
  readonly deletions: number;
  /** Unified-style patch text, truncated. Null when the file is too large to diff line by line. */
  readonly patch: string | null;
  readonly truncated: boolean;
}

export interface RevisionDiff {
  readonly files: readonly FileDiff[];
  readonly totals: { readonly added: number; readonly modified: number; readonly deleted: number; readonly additions: number; readonly deletions: number };
  readonly omittedFiles: number;
}

const MAX_FILES = 60;
const MAX_LINES_PER_SIDE = 1_500;
const MAX_PATCH_LINES = 200;
const CONTEXT = 2;

type Op = { kind: ' ' | '+' | '-'; text: string };

/** Classic LCS line diff, O(n*m) on bounded inputs. */
function lineDiff(before: string[], after: string[]): Op[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const ops: Op[] = before.slice(0, start).map((text) => ({ kind: ' ' as const, text }));
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: ' ', text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) ops.push({ kind: '-', text: a[i++] });
    else ops.push({ kind: '+', text: b[j++] });
  }
  while (i < a.length) ops.push({ kind: '-', text: a[i++] });
  while (j < b.length) ops.push({ kind: '+', text: b[j++] });
  for (const text of before.slice(endBefore)) ops.push({ kind: ' ', text });
  return ops;
}

function render(ops: readonly Op[]): { patch: string; truncated: boolean } {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, index) => {
    if (op.kind === ' ') return;
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(ops.length - 1, index + CONTEXT); k++) keep[k] = true;
  });
  const lines: string[] = [];
  let truncated = false;
  let gap = false;
  for (let index = 0; index < ops.length; index++) {
    if (!keep[index]) {
      gap = true;
      continue;
    }
    if (gap && lines.length > 0) lines.push('@@');
    gap = false;
    if (lines.length >= MAX_PATCH_LINES) {
      truncated = true;
      break;
    }
    lines.push(`${ops[index].kind}${ops[index].text}`);
  }
  return { patch: lines.join('\n'), truncated };
}

const linesOf = (content: string) => (content === '' ? [] : content.split('\n'));

export function diffRevisions(before: readonly ProjectFile[], after: readonly ProjectFile[]): RevisionDiff {
  const prior = new Map(before.map((file) => [file.path, file.content]));
  const next = new Map(after.map((file) => [file.path, file.content]));
  const paths = [...new Set([...prior.keys(), ...next.keys()])].sort();
  const files: FileDiff[] = [];
  let omitted = 0;
  const totals = { added: 0, modified: 0, deleted: 0, additions: 0, deletions: 0 };
  for (const path of paths) {
    const was = prior.get(path);
    const now = next.get(path);
    if (was === now) continue;
    const status = was === undefined ? 'added' : now === undefined ? 'deleted' : 'modified';
    const a = linesOf(was ?? '');
    const b = linesOf(now ?? '');
    const tooLarge = a.length > MAX_LINES_PER_SIDE || b.length > MAX_LINES_PER_SIDE;
    let additions = b.length;
    let deletions = a.length;
    let patch: string | null = null;
    let truncated = false;
    if (!tooLarge) {
      const ops = lineDiff(a, b);
      additions = ops.filter((op) => op.kind === '+').length;
      deletions = ops.filter((op) => op.kind === '-').length;
      ({ patch, truncated } = render(ops));
    }
    totals[status] += 1;
    totals.additions += additions;
    totals.deletions += deletions;
    if (files.length >= MAX_FILES) {
      omitted++;
      continue;
    }
    files.push({ path, status, additions, deletions, patch, truncated: truncated || tooLarge });
  }
  return { files, totals, omittedFiles: omitted };
}

/** A short, human sentence for a revision's changes. */
export function describeChanges(summary: { created: readonly string[]; modified: readonly string[]; deleted: readonly string[] }): string {
  const parts: string[] = [];
  const show = (label: string, paths: readonly string[]) => {
    if (paths.length === 0) return;
    const names = paths.slice(0, 3).join(', ');
    parts.push(`${label} ${paths.length} file${paths.length === 1 ? '' : 's'} (${names}${paths.length > 3 ? ', …' : ''})`);
  };
  show('added', summary.created);
  show('changed', summary.modified);
  show('removed', summary.deleted);
  return parts.length ? parts.join('; ') : 'no file changes';
}
