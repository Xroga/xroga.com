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

/**
 * The same form saved again with the same values. A reload that seems to show an unsaved form makes a model re-apply every field and press Save again, several times, which
 * changes nothing (or, on a create form, adds duplicates). The values typed since the last submit, with the submit control, make the key; the third identical one is told once.
 */
const RESAVES = 3;

export class RepeatDetector {
  #history: string[] = [];
  #told = new Set<string>();
  #typed: string[] = [];
  #saves = new Map<string, number>();

  /** Records one acting call; returns the advice the first time a block has been done REPEATS times in a row. */
  record(tool: string, args: Record<string, unknown>, text: string, isError: boolean): string | undefined {
    if (IGNORED.has(tool)) return undefined;
    // A failing call breaks the pattern: what follows is a repair, not a routine.
    if (isError) {
      this.#history = [];
      return undefined;
    }
    const again = this.#resave(tool, args, text);
    if (again) return again;
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
      return `You have now done this same sequence ${REPEATS} times in a row: ${block.join(' → ')}. If more items remain, do not carry on one call at a time: put ALL the remaining repetitions in ONE batch call: the steps once, with foreach set to the list of items ({field: value} objects) and \${item.field} and \${index} in the arguments, targets by role and name because a ref only lasts until the page changes; then check the result with a snapshot or read. batch stops at the first failure (continueOnError records it and goes on) and returns the trail. Skip this if each item needs something you must read first.`;
    }
    return undefined;
  }

  #resave(tool: string, args: Record<string, unknown>, text: string): string | undefined {
    const hit = /\[\w+\]\s+(\w+)\s+«([^»]*)»/.exec(text.slice(0, 400));
    if (tool === 'set' && hit) this.#typed.push(`${hit[1]} ${hit[2]}=${JSON.stringify(args.value)}`);
    else if (tool === 'fill_form' && Array.isArray(args.fields)) this.#typed.push(...args.fields.map(f => JSON.stringify((f as { value?: unknown }).value)));
    else if ((tool === 'click' || tool === 'press') && /\bsubmit:/.test(text.slice(0, 600)) && hit) {
      const key = `${hit[1]} ${hit[2]} | ${[...this.#typed].sort().join(';')}`;
      this.#typed = [];
      if (!this.#typedAny(key)) return undefined;
      const n = (this.#saves.get(key) ?? 0) + 1;
      this.#saves.set(key, n);
      if (n === RESAVES) {
        return `You have now saved this same form with the same values ${RESAVES} times (${hit[2]!.slice(0, 40)}). Saving it again will not change anything, and on a create form it can add a duplicate. If a reload shows it unsaved, find out why instead (the request status of the save, diagnostics, whether the page restores its own state), or finish with what you can show and say what stays unverified.`;
      }
    }
    return undefined;
  }

  /** A save with nothing typed before it (a plain Save button) is not the same loop as a form re-filled with the same values: only the second kind counts. */
  #typedAny(key: string): boolean {
    return !key.endsWith('| ');
  }
}
