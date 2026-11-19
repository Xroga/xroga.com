// The generic adapter behind the `run_script_console` tool: it maps the CommandSurface phases onto the layer's own tools (canvas, read, wait), so the
// run goes through the same permissions, approvals and journal as any call. The model supplies only data (points, keys, a pattern), never code that
// is evaluated here.
import type { CommandSurface, Receipt } from './command-surface';

export interface ToolResult { ok: boolean; text: string }
export type CallTool = (tool: string, input: Record<string, unknown>) => Promise<ToolResult>;

export interface ConsoleArgs {
  /** Steps that open the console (menu clicks, keys), each {tool, args}; every one must succeed. */
  open?: Array<{ tool: string; args: Record<string, unknown> }>;
  /** Text that must be visible once the console is open (the target is the right editor). */
  editorText?: string;
  /** Viewport fraction of the editor: clicked to focus it. */
  editorAt: [number, number];
  text: string;
  /** Run with a key (for example Control+Enter), or by clicking a viewport fraction. */
  executeKey?: string;
  executeAt?: [number, number];
  /** A regular expression the Output must match for the run to count (for example "objects 3"). */
  expectOutput: string;
  /** After a verified run: keys or clicks that export. */
  exportSteps?: Array<{ tool: string; args: Record<string, unknown> }>;
  /** Steps that clear the app's Output before running (for example its Clear button). Without them the Output must have CHANGED from a baseline read, so a previous run's text is never taken as this run's result. */
  clearSteps?: Array<{ tool: string; args: Record<string, unknown> }>;
}

const ALLOWED = new Set(['canvas', 'click', 'press', 'wait', 'tabs', 'navigate', 'set', 'type']);

export function validateConsoleArgs(a: Partial<ConsoleArgs>): string | null {
  if (!a.text || typeof a.text !== 'string') return 'text (the program) is required';
  if (!Array.isArray(a.editorAt) || a.editorAt.length !== 2 || a.editorAt.some(n => typeof n !== 'number' || n < 0 || n > 1)) return 'editorAt must be [x, y] as viewport fractions between 0 and 1';
  if (!a.executeKey && !a.executeAt) return 'executeKey or executeAt is required';
  if (a.executeAt && (a.executeAt.length !== 2 || a.executeAt.some(n => typeof n !== 'number' || n < 0 || n > 1))) return 'executeAt must be [x, y] fractions';
  if (typeof a.expectOutput !== 'string' || !a.expectOutput) return 'expectOutput (a pattern the Output must match) is required';
  try { new RegExp(a.expectOutput); } catch { return 'expectOutput is not a valid pattern'; }
  for (const s of [...(a.open ?? []), ...(a.exportSteps ?? []), ...(a.clearSteps ?? [])]) if (!s || !ALLOWED.has(s.tool)) return `step tool ${String(s?.tool)} is not allowed here`;
  return null;
}

export function scriptConsoleSurface(a: ConsoleArgs, call: CallTool): CommandSurface {
  let baseline: string | null = null;
  let cleared = false;
  const receipt = (phase: Receipt['phase'], r: ToolResult, observed = r.text): Receipt => ({ phase, ok: r.ok, observed: observed.slice(0, 2000), note: r.ok ? undefined : r.text.split('\n')[0] });
  const steps = async (phase: Receipt['phase'], list: ConsoleArgs['open']): Promise<Receipt> => {
    let last: ToolResult = { ok: true, text: 'nothing to do' };
    for (const s of list ?? []) {
      last = await call(s.tool, s.args);
      if (!last.ok) return receipt(phase, last);
    }
    return receipt(phase, last);
  };
  return {
    discover: () => steps('discover', a.open),
    targetEditor: async () => {
      if (!a.editorText) return { phase: 'targetEditor', ok: true, observed: 'no editor text to check' };
      const r = await call('wait', { text: a.editorText, timeoutMs: 1500 });
      return r.ok ? receipt('targetEditor', r, `found ${a.editorText}`) : { phase: 'targetEditor', ok: true, unknown: true, observed: `the editor text "${a.editorText}" is not visible: the console is not open or another menu opened` };
    },
    focus: async () => receipt('focus', await call('canvas', { action: 'click', at: a.editorAt, intent: 'focus the script editor' })),
    replaceText: async (text: string) => receipt('replaceText', await call('canvas', { action: 'type', text, replace: true, intent: 'enter the script' })),
    execute: async () => {
      // Fresh-output guard: clear the Output, or remember what it said before this run.
      if (a.clearSteps?.length) {
        const c = await steps('execute', a.clearSteps);
        if (!c.ok) return c;
        cleared = true;
      } else {
        const before = await call('read', {});
        baseline = before.ok ? before.text.trim() : null;
      }
      return receipt('execute', a.executeKey
        ? await call('canvas', { action: 'key', key: a.executeKey, intent: 'run the script' })
        : await call('canvas', { action: 'click', at: a.executeAt, intent: 'run the script' }));
    },
    readOutput: async () => {
      const r = await call('read', {});
      return receipt('readOutput', r);
    },
    verify: async (output: string) => {
      if (!cleared && baseline !== null && output.trim() === baseline) {
        return { phase: 'verify', ok: false, observed: output.slice(0, 500), note: 'the Output is identical to what it said before this run, so it may be left over from an earlier run; clear it first (clearSteps) or check the page itself' };
      }
      const ok = new RegExp(a.expectOutput).test(output);
      return { phase: 'verify', ok, observed: output.slice(0, 500), note: ok ? undefined : `the Output does not match /${a.expectOutput}/; read it and fix only what it names` };
    },
    export: () => steps('export', a.exportSteps),
  };
}

export const SCRIPT_CONSOLE_TOOL = {
  name: 'run_script_console',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Run ONE program in an app scripting console (a painted editor with a Scripts, Macro or Console panel) as a fixed sequence with no model turn between phases: ' +
    'open the console (open steps), check it is the right editor (editorText), click into it (editorAt), replace its text with the program, run it, read the Output, ' +
    'check the Output matches expectOutput, then optionally export (exportSteps). Pass clearSteps (the app Clear button) so the Output of an earlier run is never mistaken for this one; without it the Output must differ from a baseline read. It stops at the first phase that fails or shows an unexpected state and returns every receipt. ' +
    'Points are viewport fractions 0..1 taken from a screenshot you just took. Read the app documentation first so the program uses real API names. The same program is never run twice on one document.',
  parameters: {
    type: 'object',
    properties: {
      open: { type: 'array', maxItems: 8, items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'], additionalProperties: false } },
      editorText: { type: 'string' },
      editorAt: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      text: { type: 'string', maxLength: 6000 },
      executeKey: { type: 'string' },
      executeAt: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      expectOutput: { type: 'string' },
      clearSteps: { type: 'array', maxItems: 4, items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'], additionalProperties: false } },
      exportSteps: { type: 'array', maxItems: 8, items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'], additionalProperties: false } },
      documentId: { type: 'string' },
    },
    required: ['text', 'editorAt', 'expectOutput'],
    additionalProperties: false,
  },
};
