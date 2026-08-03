/**
 * Turns the builder's raw token stream into a live account of files being written.
 *
 * The builder has always streamed. `callBuilderStream` collected those tokens into
 * `bufferedDeltas` and released them only after the whole response finished, because a
 * response that fails `validateResponse` must not reach the user as if it were real
 * output. Correct — but it meant the four minutes during which a project is actually
 * being written produced nothing on screen at all.
 *
 * Buffering the *text* and narrating the *structure* are different things. This reads
 * the stream as it arrives and reports what is being written right now: a path when a
 * file opens, a growing line count while it fills, a final size when it closes. None of
 * it is a prediction — every line corresponds to bytes that have already arrived.
 *
 * The builder emits files as fenced blocks in one of two forms:
 *
 *     ```tsx path=app/page.tsx        ```file:styles.css
 *     …                               …
 *     ```                             ```
 *
 * which is the same grammar `extractProjectFiles` parses at the end. This parses it
 * incrementally, so a fence split across two network chunks — the normal case — is
 * still recognised.
 */

export type NarrationEvent =
  | { kind: 'file_start'; path: string }
  | { kind: 'file_progress'; path: string; lines: number }
  | { kind: 'file_done'; path: string; lines: number; bytes: number };

/** Opening fence with an explicit path, in either supported form. */
const OPEN_FENCE = /```(?:([A-Za-z0-9]+)\s+path=([^\s`\n]+)|file:([^\s`\n]+))[^\n]*\n/;
/** A closing fence is a line whose only content is three backticks. */
const CLOSE_FENCE = /^```[ \t]*$/m;

/** Lines between progress reports. Frequent enough to look alive, rare enough that a
 *  600-line file does not produce 600 SSE frames. */
const PROGRESS_EVERY_LINES = 12;

export class BuildStreamNarrator {
  /** Text received but not yet consumed by the parser. */
  private pending = '';
  /** The file currently open, if any. */
  private current: { path: string; lines: number; bytes: number; reportedAt: number } | null = null;
  private readonly seen = new Set<string>();

  /** Paths opened so far, in order. */
  get paths(): string[] {
    return [...this.seen];
  }

  /**
   * Feeds a chunk and returns whatever became true because of it.
   *
   * Returning an array rather than firing callbacks keeps this synchronous and pure
   * enough to test: the same chunk sequence always yields the same events, whatever
   * the chunk boundaries happen to be.
   */
  push(delta: string): NarrationEvent[] {
    if (!delta) return [];
    this.pending += delta;
    const events: NarrationEvent[] = [];

    // Loop because one chunk can close a file and open the next.
    for (;;) {
      if (!this.current) {
        const open = OPEN_FENCE.exec(this.pending);
        if (!open) {
          // Keep only enough tail to complete a fence that straddles this boundary.
          this.pending = this.pending.slice(-200);
          break;
        }
        const path = (open[2] ?? open[3] ?? '').replace(/^\.\//, '').trim();
        this.pending = this.pending.slice(open.index + open[0].length);
        if (!path) continue;
        this.current = { path, lines: 0, bytes: 0, reportedAt: 0 };
        this.seen.add(path);
        events.push({ kind: 'file_start', path });
        continue;
      }

      const close = CLOSE_FENCE.exec(this.pending);
      if (!close) {
        // Everything up to the last newline is settled file content: count it, then
        // drop it — the authoritative copy is assembled from the complete response,
        // not from here. The trailing partial line must be retained, because a closing
        // fence is a whole line and providers do not align chunks to line endings. An
        // earlier version consumed the entire buffer here and swallowed a `` ``` ``
        // that had only partly arrived, merging two files into one.
        const settled = this.pending.lastIndexOf('\n');
        if (settled >= 0) {
          this.consume(this.pending.slice(0, settled + 1));
          this.pending = this.pending.slice(settled + 1);
        }
        const open = this.current;
        if (open.lines - open.reportedAt >= PROGRESS_EVERY_LINES) {
          open.reportedAt = open.lines;
          events.push({ kind: 'file_progress', path: open.path, lines: open.lines });
        }
        break;
      }

      this.consume(this.pending.slice(0, close.index));
      const done = this.current;
      events.push({
        kind: 'file_done',
        path: done.path,
        lines: Math.max(1, done.lines),
        bytes: done.bytes,
      });
      this.current = null;
      this.pending = this.pending.slice(close.index + close[0].length);
    }

    return events;
  }

  /**
   * Closes an open file at end of stream.
   *
   * A response cut short by a timeout leaves a fence open. Reporting the partial file
   * is more honest than dropping it silently — it is exactly the evidence that the
   * output was truncated.
   */
  finish(): NarrationEvent[] {
    if (!this.current) return [];
    this.consume(this.pending);
    this.pending = '';
    const done = this.current;
    this.current = null;
    return [{ kind: 'file_done', path: done.path, lines: Math.max(1, done.lines), bytes: done.bytes }];
  }

  private consume(text: string): void {
    if (!this.current || !text) return;
    this.current.bytes += text.length;
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 10) this.current.lines += 1;
    }
  }
}

/** The terminal line for a narration event. Present tense while writing, past when done. */
export function narrationLine(event: NarrationEvent): string {
  switch (event.kind) {
    case 'file_start':
      return `Writing ${event.path}`;
    case 'file_progress':
      return `Writing ${event.path} — ${event.lines} lines so far`;
    case 'file_done':
      return `Wrote ${event.path} — ${event.lines} ${event.lines === 1 ? 'line' : 'lines'}`;
  }
}
