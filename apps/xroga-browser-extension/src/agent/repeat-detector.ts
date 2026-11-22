/**
 * Notices when the run is doing the same short sequence of actions again and again for different items (ten drafts, a list of rows, a page of records), and says once
 * that the rest can go in one `batch` call. Every call the model makes alone is a model turn of several seconds; a sequence it has already done three times, with the
 * same controls each time, is a sequence it knows. This is advice, never a limit: the run may carry on one call at a time.
 *
 * A call is reduced to a signature: the tool and the control it hit (its role and the start of its name, with addresses and numbers blurred so "ana@x" and
 * "bilal@x" read the same), or for fill_form the number of fields. Looking tools (snapshot, read, find, screenshot, wait, plan) are not part of a sequence.
 */
const IGNORED = new Set(['snapshot', 'read', 'find', 'screenshot', 'wait', 'plan', 'done', 'diagnostics', 'find_skill', 'read_skill', 'batch', 'start_parallel_tasks', 'parallel_task_status']);
const MAX_HISTORY = 60;
const REPEATS = 3;
const MIN_BLOCK = 2;
const MAX_BLOCK = 6;

export function signatureOf(tool: string, args: Record<string, unknown>, text: string): string {
  if (tool === 'fill_form') return `fill_form(${Array.isArray(args.fields) ? args.fields.length : '?'} fields)`;
  const hit = /\[\w+\]\s+(\w+)\s+«([^»]*)»/.exec(text.slice(0, 400));
  if (!hit) return tool;
  const name = hit[2]!.replace(/[\w.+-]+@[\w.-]+/g, '<email>').replace(/\d+/g, '#').trim().slice(0, 14);
  return `${tool} ${hit[1]} «${name}»`;
}

export class RepeatDetector {
  #history: string[] = [];
  #told = new Set<string>();

  /** Records one acting call; returns the advice the first time a block has been done REPEATS times in a row. */
  record(tool: string, args: Record<string, unknown>, text: string, isError: boolean): string | undefined {
    if (IGNORED.has(tool)) return undefined;
    // A failing call breaks the pattern: what follows is a repair, not a routine.
    if (isError) {
      this.#history = [];
      return undefined;
    }
    this.#history.push(signatureOf(tool, args, text));
    if (this.#history.length > MAX_HISTORY) this.#history.shift();
    const h = this.#history;
    for (let k = MIN_BLOCK; k <= MAX_BLOCK; k++) {
      if (h.length < k * REPEATS) continue;
      const block = h.slice(-k);
      if (new Set(block).size < 2) continue;
      let same = true;
      for (let r = 2; r <= REPEATS && same; r++) same = h.slice(-k * r, -k * (r - 1)).every((s, i) => s === block[i]);
      if (!same) continue;
      // The same loop seen from a later starting point (fill, Close, New message) is the same loop: the key does not depend on where the block begins.
      const key = [...block].sort().join('|');
      if (this.#told.has(key)) return undefined;
      this.#told.add(key);
      return `You have now done this same sequence ${REPEATS} times in a row: ${block.join(' → ')}. If more items remain, do not carry on one call at a time: put ALL the remaining repetitions in one batch call (the steps in order, each item's values in its own steps, targets by role and name because a ref only lasts until the page changes), then check the result with a snapshot or read. batch stops at the first failure and returns the trail. Skip this if each item needs something you must read first.`;
    }
    return undefined;
  }
}
