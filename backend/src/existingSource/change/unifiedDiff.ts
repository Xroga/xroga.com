/**
 * Line diff and unified-diff text for a change set, plus exact search/replace editing.
 *
 * The diff is what a reviewer reads and what a patch export contains, so it is computed from the real before/after content, never
 * from what a model said it changed. Line endings are preserved on both sides: a file that used CRLF shows CRLF lines in its hunks.
 */

export interface DiffStats { readonly additions: number; readonly deletions: number }

type Op = { kind: 'eq' | 'add' | 'del'; line: string };

const splitLines = (text: string): { lines: string[]; endsWithNewline: boolean } => {
  if (text === '') return { lines: [], endsWithNewline: true };
  const endsWithNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (endsWithNewline) lines.pop();
  return { lines, endsWithNewline };
};

/** Longest-common-subsequence line diff with common prefix and suffix trimmed first; a pathological pair degrades to replace-all. */
function diffLines(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length; let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ops: Op[] = a.slice(0, start).map((line) => ({ kind: 'eq', line }));
  const midA = a.slice(start, endA); const midB = b.slice(start, endB);
  if (midA.length * midB.length > 4_000_000) {
    for (const line of midA) ops.push({ kind: 'del', line });
    for (const line of midB) ops.push({ kind: 'add', line });
  } else {
    const n = midA.length; const m = midB.length;
    const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i]![j] = midA[i] === midB[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    let i = 0; let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) { ops.push({ kind: 'eq', line: midA[i]! }); i++; j++; }
      else if (table[i + 1]![j]! >= table[i]![j + 1]!) ops.push({ kind: 'del', line: midA[i++]! });
      else ops.push({ kind: 'add', line: midB[j++]! });
    }
    while (i < n) ops.push({ kind: 'del', line: midA[i++]! });
    while (j < m) ops.push({ kind: 'add', line: midB[j++]! });
  }
  for (const line of a.slice(endA)) ops.push({ kind: 'eq', line });
  return ops;
}

export function diffStats(before: string, after: string): DiffStats {
  const ops = diffLines(splitLines(before).lines, splitLines(after).lines);
  return { additions: ops.filter((o) => o.kind === 'add').length, deletions: ops.filter((o) => o.kind === 'del').length };
}

/** One file's unified diff (`--- a/path`, `+++ b/path`, hunks with 3 lines of context). `null` content means the file does not exist on that side. */
export function unifiedDiff(path: string, before: string | null, after: string | null, context = 3): string {
  if (before === after) return '';
  const a = splitLines(before ?? ''); const b = splitLines(after ?? '');
  const ops = diffLines(a.lines, b.lines);
  const header = [`diff --git a/${path} b/${path}`];
  if (before === null) header.push('new file mode 100644'); else if (after === null) header.push('deleted file mode 100644');
  header.push(before === null ? '--- /dev/null' : `--- a/${path}`, after === null ? '+++ /dev/null' : `+++ b/${path}`);
  const changed = ops.map((o, i) => (o.kind === 'eq' ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return `${header.join('\n')}\n`;
  const hunks: Array<[number, number]> = [];
  for (const idx of changed) {
    const lo = Math.max(0, idx - context); const hi = Math.min(ops.length, idx + context + 1);
    const last = hunks[hunks.length - 1];
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi); else hunks.push([lo, hi]);
  }
  const out = [...header];
  for (const [lo, hi] of hunks) {
    let oldStart = 1; let newStart = 1;
    for (let k = 0; k < lo; k++) { if (ops[k]!.kind !== 'add') oldStart++; if (ops[k]!.kind !== 'del') newStart++; }
    const slice = ops.slice(lo, hi);
    const oldCount = slice.filter((o) => o.kind !== 'add').length; const newCount = slice.filter((o) => o.kind !== 'del').length;
    out.push(`@@ -${oldCount === 0 ? oldStart - 1 : oldStart},${oldCount} +${newCount === 0 ? newStart - 1 : newStart},${newCount} @@`);
    for (const o of slice) out.push(`${o.kind === 'eq' ? ' ' : o.kind === 'add' ? '+' : '-'}${o.line}`);
  }
  // a missing final newline is part of the content and is shown the way git shows it
  if (before !== null && before !== '' && !a.endsWithNewline || after !== null && after !== '' && !b.endsWithNewline) out.push('\\ No newline at end of file');
  return `${out.join('\n')}\n`;
}

export type EditFailure = 'not_found' | 'ambiguous' | 'empty_find' | 'no_change';

export class EditError extends Error {
  constructor(readonly reason: EditFailure, message: string) { super(message); this.name = 'EditError'; }
}

/**
 * An exact, unique search/replace edit. The text to find must occur exactly once (after matching the file's own line endings), so an
 * edit can never land on a different place than the one that was read, and nothing else in the file changes.
 */
export function applySearchReplace(content: string, find: string, replace: string): string {
  if (!find) throw new EditError('empty_find', 'The text to replace must not be empty.');
  const crlf = content.includes('\r\n');
  const norm = (s: string) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'));
  const needle = norm(find); const next = norm(replace);
  const first = content.indexOf(needle);
  if (first < 0) throw new EditError('not_found', 'The text to replace was not found in the file as it is now.');
  if (content.indexOf(needle, first + needle.length) >= 0 || content.indexOf(needle, first + 1) >= 0) throw new EditError('ambiguous', 'The text to replace occurs more than once; include more surrounding lines.');
  const out = content.slice(0, first) + next + content.slice(first + needle.length);
  if (out === content) throw new EditError('no_change', 'The edit does not change the file.');
  return out;
}
