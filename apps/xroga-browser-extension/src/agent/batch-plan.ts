// Batch execution with control flow: a list of tool calls that run as one unit, where a step may carry `when` / `unless` conditions and a bounded
// `repeat`, so "dismiss the banner if there is one" and "click Next until it is gone" cost one model turn instead of one per step. Every model
// turn costs seconds; a step here costs milliseconds.
//
// Adapted from dylansantwani/openbrowser, extension/background/batch.js (MIT, Copyright (c) 2026 OpenBrowser contributors, commit 1f67080).
// This is a TypeScript port of its pure planner: the same step grammar and the same ceilings, with Xroga's own condition vocabulary and error
// style. No string a model writes is ever evaluated: conditions are data, answered by the caller.
//
// Pure: the caller supplies `run` (run one tool call) and `test` (answer one condition), so the planner is tested without Chrome. This module does
// not decide what may run: every step still goes through the caller's execution path, with its permissions, approvals and journal.

export const MAX_REPEAT_DEFAULT = 10;
export const MAX_REPEAT = 50;
export const MAX_OPS = 200;
export const MAX_NESTING = 3;

/** What a condition can ask about the page. Answered instantly, never waited for. */
export type Condition =
  | { for: 'text'; value: string }
  | { for: 'text_gone'; value: string }
  | { for: 'url'; value: string }
  | { for: 'visible'; role: string; name?: string }
  | { for: 'hidden'; role: string; name?: string };

export type Repeat = number | { until?: Condition; while?: Condition; max?: number };

export interface Step {
  tool?: string;
  args?: Record<string, unknown>;
  when?: Condition;
  unless?: Condition;
  repeat?: Repeat;
  /** A group: these steps run as one unit under this step's when, unless and repeat. */
  steps?: Step[];
}

export interface StepResult {
  text: string;
  ok?: boolean;
  /** The step succeeded but the rest should not run (a person was asked to step in, a dialog is open): why. */
  halt?: string;
}

export interface StepMeta {
  label: string;
  /** The last top-level tool step: the only one that pays for a page observation. */
  final: boolean;
}

export interface PlanOptions {
  run: (tool: string, args: Record<string, unknown>, meta: StepMeta) => Promise<StepResult>;
  test: (condition: Condition) => Promise<boolean>;
  /** Merged under every step's own arguments (for example a tabId). */
  defaults?: Record<string, unknown>;
  stopOnError?: boolean;
  /** Tools a step may not name (a batch cannot start another batch or a worker). */
  forbidden?: ReadonlySet<string>;
  /** When given, only these tools may run in the batch. */
  allow?: (tool: string) => boolean;
}

/** Thrown inside the planner to end a plan early without failing it. */
class Halt extends Error {}

interface Output {
  label: string;
  tool: string;
  ok: boolean;
  skipped?: boolean;
  text: string;
  note?: string;
  runs?: number;
}

export class BatchError extends Error {
  constructor(message: string, readonly trail: string) {
    super(`${message}\n\nsteps run:\n${trail}`);
  }
}

const CONDITION_KINDS = new Set(['text', 'text_gone', 'url', 'visible', 'hidden']);

export function isCondition(value: unknown): value is Condition {
  const c = value as Record<string, unknown> | null;
  if (!c || typeof c !== 'object' || typeof c.for !== 'string' || !CONDITION_KINDS.has(c.for)) return false;
  if (c.for === 'visible' || c.for === 'hidden') return typeof c.role === 'string' && c.role.length > 0 && (c.name === undefined || typeof c.name === 'string');
  return typeof c.value === 'string' && c.value.length > 0;
}

function describe(c: Condition): string {
  return 'value' in c ? `${c.for} ${JSON.stringify(c.value)}` : `${c.for} ${c.role}${c.name ? ` ${JSON.stringify(c.name)}` : ''}`;
}

/** `✓ navigate → ✓ click ×4 → – click (skipped: ...) → ✗ wait: ...` */
export function trailOf(outputs: Output[]): string {
  return outputs
    .map(o => {
      if (o.skipped) return `– ${o.tool} (${o.note})`;
      const times = (o.runs ?? 1) > 1 ? ` ×${o.runs}` : '';
      return `${o.ok ? '✓' : '✗'} ${o.tool}${times}${o.ok ? '' : `: ${o.text}`}`;
    })
    .join(' → ');
}

function clampMax(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) throw new Error('repeat max must be a positive integer');
  return Math.min(v, MAX_REPEAT);
}

function normaliseRepeat(repeat: Repeat | undefined): { until?: Condition; while?: Condition; max: number } | null {
  if (repeat === undefined || repeat === null) return null;
  if (typeof repeat === 'number') return { max: clampMax(repeat) };
  if (typeof repeat !== 'object') throw new Error('repeat must be a number or {until, while, max}');
  if (!repeat.until && !repeat.while && repeat.max == null) throw new Error('repeat needs until, while, or max');
  if (repeat.until && !isCondition(repeat.until)) throw new Error('repeat.until is not a valid condition');
  if (repeat.while && !isCondition(repeat.while)) throw new Error('repeat.while is not a valid condition');
  return { until: repeat.until, while: repeat.while, max: clampMax(repeat.max ?? MAX_REPEAT_DEFAULT) };
}

/** Counts the tool calls a step list could run at most, to refuse a plan that cannot fit under the ceiling before it starts. */
export function worstCase(steps: Step[]): number {
  return steps.reduce((n, s) => {
    const times = (() => {
      try {
        return normaliseRepeat(s.repeat)?.max ?? 1;
      } catch {
        return 1;
      }
    })();
    return n + times * (Array.isArray(s.steps) ? worstCase(s.steps) : 1);
  }, 0);
}

export async function runPlan(steps: Step[], opts: PlanOptions): Promise<{ text: string; ran: number; ok: boolean; halted?: string }> {
  const { run, test, defaults = {}, stopOnError = true, forbidden = new Set<string>(), allow } = opts;
  if (!Array.isArray(steps) || !steps.length) throw new Error('batch needs at least one step');
  const outputs: Output[] = [];
  let ops = 0;
  let halted: string | undefined;
  let finalIndex = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.tool && !Array.isArray(steps[i]?.steps)) {
      finalIndex = i;
      break;
    }
  }

  const evaluate = async (cond: Condition | undefined, where: string): Promise<boolean> => {
    if (!isCondition(cond)) throw new Error(`${where} needs a condition such as {for:"text", value:"Next"}`);
    return !!(await test(cond));
  };

  const validate = (step: Step, label: string, depth: number) => {
    if (!step || typeof step !== 'object') throw new Error(`step ${label} is not an object`);
    const isGroup = Array.isArray(step.steps);
    if (!isGroup && !step.tool) throw new Error(`step ${label} needs a tool (or steps)`);
    if (isGroup && step.tool) throw new Error(`step ${label} has both tool and steps: a group has no tool of its own`);
    if (step.tool && (forbidden.has(step.tool) || (allow && !allow(step.tool)))) throw new Error(`step ${label}: ${step.tool} cannot run inside a batch`);
    if (isGroup && depth + 1 > MAX_NESTING) throw new Error(`step ${label}: groups nest at most ${MAX_NESTING} deep`);
    if (isGroup && !step.steps!.length) throw new Error(`step ${label}: an empty group does nothing`);
  };

  const once = async (step: Step, args: Record<string, unknown>, label: string, depth: number, iteration: number, tool: string): Promise<void> => {
    if (Array.isArray(step.steps)) {
      await list(step.steps, depth + 1, label);
      return;
    }
    if (++ops > MAX_OPS) throw new BatchError(`batch exceeded ${MAX_OPS} tool calls: a repeat is probably not terminating`, trailOf(outputs));
    try {
      const result = await run(step.tool!, args, { label, final: depth === 0 && label === String(finalIndex + 1) });
      if (result.ok === false) throw new Error(result.text.split('\n')[0] || 'the step failed');
      const prev = iteration > 1 ? [...outputs].reverse().find(o => o.label === label && o.ok && !o.skipped) : undefined;
      if (prev) {
        prev.text = result.text;
        prev.runs = iteration;
      } else {
        outputs.push({ label, tool, ok: true, text: result.text, runs: iteration || 1 });
      }
      if (result.halt) {
        halted = result.halt;
        throw new Halt(result.halt);
      }
    } catch (error) {
      if (error instanceof Halt) throw error;
      const message = error instanceof Error ? error.message : String(error);
      outputs.push({ label, tool, ok: false, text: message, runs: iteration });
      if (stopOnError) throw new BatchError(`step ${label} (${tool}) failed: ${message}`, trailOf(outputs));
    }
  };

  const one = async (step: Step, label: string, depth: number): Promise<void> => {
    validate(step, label, depth);
    const args = { ...defaults, ...(step.args ?? {}) };
    const isGroup = Array.isArray(step.steps);
    const tool = isGroup ? `group(${step.steps!.length})` : step.tool!;
    // Gate first. A skipped step is recorded so the trail says why nothing ran.
    if (step.when && !(await evaluate(step.when, 'when'))) {
      outputs.push({ label, tool, ok: true, skipped: true, text: '', note: `skipped: ${describe(step.when)} was false` });
      return;
    }
    if (step.unless && (await evaluate(step.unless, 'unless'))) {
      outputs.push({ label, tool, ok: true, skipped: true, text: '', note: `skipped: ${describe(step.unless)} was true` });
      return;
    }
    const repeat = normaliseRepeat(step.repeat);
    if (!repeat) return once(step, args, label, depth, 0, tool);
    // A `while` that is already false runs zero times; an `until` runs at least once (do/while): "click Next until it is gone".
    let runs = 0;
    let satisfied = !(repeat.until || repeat.while);
    while (runs < repeat.max) {
      if (repeat.while && !(await evaluate(repeat.while, 'while'))) {
        satisfied = true;
        break;
      }
      await once(step, args, label, depth, runs + 1, tool);
      runs++;
      if (repeat.until && (await evaluate(repeat.until, 'until'))) {
        satisfied = true;
        break;
      }
    }
    if (!satisfied) {
      const cond = describe((repeat.until ?? repeat.while)!);
      const message = `repeat hit max ${repeat.max} with ${cond} still ${repeat.until ? 'false' : 'true'}`;
      outputs.push({ label, tool, ok: false, text: message, runs });
      if (stopOnError) throw new BatchError(`step ${label} (${tool}) ${message}`, trailOf(outputs));
    }
  };

  async function list(items: Step[], depth: number, path: string): Promise<void> {
    for (const [i, step] of items.entries()) await one(step, path ? `${path}.${i + 1}` : String(i + 1), depth);
  }

  // The whole plan is checked before anything runs: a bad step late in the list must not leave the earlier ones done.
  const precheck = (items: Step[], depth: number, path: string): void => {
    for (const [i, step] of items.entries()) {
      const label = path ? `${path}.${i + 1}` : String(i + 1);
      validate(step, label, depth);
      if (step.when !== undefined && !isCondition(step.when)) throw new Error(`step ${label}: when needs a condition such as {for:"text", value:"Next"}`);
      if (step.unless !== undefined && !isCondition(step.unless)) throw new Error(`step ${label}: unless needs a condition such as {for:"text", value:"Next"}`);
      normaliseRepeat(step.repeat);
      if (Array.isArray(step.steps)) precheck(step.steps, depth + 1, label);
    }
  };
  precheck(steps, 0, '');
  if (worstCase(steps) > MAX_OPS) throw new Error(`this batch could run more than ${MAX_OPS} tool calls; make it smaller`);
  try {
    await list(steps, 0, '');
  } catch (error) {
    if (!(error instanceof Halt)) throw error;
  }
  const last = [...outputs].reverse().find(o => o.ok && !o.skipped) ?? outputs[outputs.length - 1];
  const stopped = halted ? `\n\nThe batch stopped here: ${halted}` : '';
  return { text: `${trailOf(outputs)}\n\n${last?.text ?? ''}${stopped}`.trim(), ran: ops, ok: outputs.every(o => o.ok), ...(halted ? { halted } : {}) };
}

/** The tools a batch step may name: the page tools of the layer. Everything else (agent tools, `upload`, `done`) runs as an ordinary call. */
export const BATCH_TOOLS: ReadonlySet<string> = new Set([
  'snapshot', 'find', 'read', 'wait', 'click', 'set', 'type', 'press', 'navigate', 'fill_form', 'scroll', 'hover', 'drag', 'tabs', 'handle_dialog',
]);

export const BATCH_TOOL = {
  name: 'batch',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Run several page tools as ONE call, with no model turn between steps. Use it when you already know the steps: fill several fields, dismiss a banner only if it is there ' +
    '(when/unless), click Next until it is gone (repeat with until). Each step is {tool, args} with the same arguments the tool takes alone, plus optional when / unless ' +
    '(a condition: {for:"text"|"text_gone"|"url", value} or {for:"visible"|"hidden", role, name}) and repeat (a number, or {until|while: condition, max}). ' +
    'steps inside a step make a group. Targets must be known: use refs or role and name from a snapshot you have. The batch stops at the first failure and ' +
    'returns the trail of what ran plus the last result. Do a snapshot or read afterwards to check the page. Consequential steps still need their approvals. ' +
    'Do not put a batch inside a batch. Do not use it when a step needs what the previous one shows.',
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: 40,
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: [...BATCH_TOOLS] },
            args: { type: 'object' },
            when: { type: 'object' },
            unless: { type: 'object' },
            repeat: {},
            steps: { type: 'array', items: { type: 'object' } },
          },
          additionalProperties: false,
        },
      },
    },
    required: ['steps'],
    additionalProperties: false,
  },
};
