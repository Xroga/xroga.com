// The generic adapter behind the `run_script_console` tool: it maps the CommandSurface phases onto the layer's own tools (canvas, read, wait), so the
// run goes through the same permissions, approvals and journal as any call. The model supplies only data (points, keys, a pattern), never code that
// is evaluated here.
import type { CommandSurface, Receipt } from './command-surface';

export interface ToolResult { ok: boolean; text: string }
export type CallTool = (tool: string, input: Record<string, unknown>) => Promise<ToolResult>;

/** An element the layer can target: a ref from the latest snapshot, or a role and name. */
export interface ElementTarget { ref?: string; role?: string; name?: string }

export interface ConsoleArgs {
  /** Menu items to click in order to open the console, by name (for example Tools, Scripts, Scripts Panel). Simpler than open steps. */
  openPath?: string[];
  /** Steps that open the console (menu clicks, keys), each {tool, args}; every one must succeed. */
  open?: Array<{ tool: string; args: Record<string, unknown> }>;
  /** Text that must be visible once the console is open (the target is the right editor). */
  editorText?: string;
  /** The editor as an element (a ref or role and name from the outline). Preferred: no coordinates needed. */
  editor?: ElementTarget;
  /** Set to field when the editor is an ordinary text field, not a painted surface. */
  editorKind?: 'painted' | 'field';
  /** Viewport fraction of the editor, for a painted editor the outline does not list. */
  editorAt?: [number, number];
  text: string;
  /** Run with a key (for example Control+Enter), or by clicking a viewport fraction. */
  executeKey?: string;
  executeAt?: [number, number];
  /** The Run control as an element. */
  run?: ElementTarget;
  /** The Clear control as an element: clicked before the run so the Output starts empty. */
  clear?: ElementTarget;
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
  const isTarget = (t: ElementTarget | undefined) => !!t && typeof t === 'object' && (typeof t.ref === 'string' || typeof t.role === 'string');
  if (!isTarget(a.editor) && !(Array.isArray(a.editorAt) && a.editorAt.length === 2 && a.editorAt.every(n => typeof n === 'number' && n >= 0 && n <= 1))) return 'give the editor as an element (editor: {ref} or {role, name}) or as viewport fractions editorAt: [x, y] between 0 and 1';
  if (!a.executeKey && !a.executeAt && !isTarget(a.run)) return 'say how to run it: run (an element), executeKey or executeAt';
  if (a.executeAt && (a.executeAt.length !== 2 || a.executeAt.some(n => typeof n !== 'number' || n < 0 || n > 1))) return 'executeAt must be [x, y] fractions';
  if (typeof a.expectOutput !== 'string' || !a.expectOutput) return 'expectOutput (a pattern the Output must match) is required';
  try { new RegExp(a.expectOutput); } catch { return 'expectOutput is not a valid pattern'; }
  if (a.openPath !== undefined && (!Array.isArray(a.openPath) || a.openPath.length > 6 || a.openPath.some(n => typeof n !== 'string' || !n || n.length > 60))) return 'openPath is a list of at most 6 menu item names';
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
    discover: () => steps('discover', [...(a.openPath ?? []).map(name => ({ tool: 'click', args: { target: { role: 'menuitem', name } } })), ...(a.open ?? [])]),
    targetEditor: async () => {
      if (!a.editorText) return { phase: 'targetEditor', ok: true, observed: 'no editor text to check' };
      const r = await call('wait', { text: a.editorText, timeoutMs: 1500 });
      return r.ok ? receipt('targetEditor', r, `found ${a.editorText}`) : { phase: 'targetEditor', ok: true, unknown: true, observed: `the editor text "${a.editorText}" is not visible: the console is not open or another menu opened` };
    },
    focus: async () => receipt('focus', a.editor ? await call('click', { target: a.editor }) : await call('canvas', { action: 'click', at: a.editorAt, intent: 'focus the script editor' })),
    replaceText: async (text: string) => receipt('replaceText', a.editor && a.editorKind === 'field' ? await call('type', { target: a.editor, text }) : await call('canvas', { action: 'type', text, replace: true, intent: 'enter the script' })),
    execute: async () => {
      // Fresh-output guard: clear the Output, or remember what it said before this run.
      if (a.clear || a.clearSteps?.length) {
        const c = a.clear ? receipt('execute', await call('click', { target: a.clear })) : await steps('execute', a.clearSteps);
        if (!c.ok) return c;
        cleared = true;
      } else {
        const before = await call('read', {});
        baseline = before.ok ? before.text.trim() : null;
      }
      return receipt('execute', a.run
        ? await call('click', { target: a.run })
        : a.executeKey
          ? await call('canvas', { action: 'key', key: a.executeKey, intent: 'run the script' })
          : await call('canvas', { action: 'click', at: a.executeAt, intent: 'run the script' }));
    },
    readOutput: async () => {
      const r = await call('read', {});
      return receipt('readOutput', r);
    },
    verify: async (output: string) => {
      const strip = (l: string) => l.replace(/^\s*(?:\[e\d+\]\s*)?(?:text|status|region|paragraph|textbox|heading)?\s*"?/i, '').replace(/"\s*$/, '').trim();
      const lines = output.split('\n').map(strip).filter(Boolean);
      const before = baseline === null ? null : new Set(baseline.split('\n').map(strip).filter(Boolean));
      // Only what changed since before the run can be this run's result; with a cleared Output the whole text is fresh.
      const fresh = cleared || before === null ? lines : lines.filter(l => !before.has(l));
      if (!cleared && before !== null && fresh.length === 0) {
        return { phase: 'verify', ok: false, observed: output.slice(0, 500), note: 'the page shows nothing new since before this run, so the Output may be left over from an earlier run or the run did not happen; check the page, or pass clear (the Clear control) so the Output starts empty' };
      }
      const re = new RegExp(a.expectOutput, 'm');
      const candidates = fresh.flatMap(l => [l, l.replace(/^[^:]*:\s*/, '')]);
      const ok = candidates.some(c => re.test(c)) || re.test(fresh.join('\n'));
      return { phase: 'verify', ok, observed: fresh.join(' | ').slice(0, 500), note: ok ? undefined : `none of the new output lines matches /${a.expectOutput}/. New lines: ${fresh.slice(0, 6).join(' | ') || '(none)'}. Read the Output and fix only what it names` };
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
    'open the console (openPath: the menu items to click in order, for example ["Tools","Scripts","Scripts Panel"]), check it is the right editor (editorText), click into it (editorAt), replace its text with the program, run it, read the Output, ' +
    'check the Output matches expectOutput, then optionally export (exportSteps). Pass clearSteps (the app Clear button) so the Output of an earlier run is never mistaken for this one; without it the Output must differ from a baseline read. It stops at the first phase that fails or shows an unexpected state and returns every receipt. ' +
    'Name the editor, Run and Clear controls by ref from the latest snapshot (editor: {ref}, run: {ref}, clear: {ref}); use viewport fractions (editorAt, executeAt) only for a painted editor the outline does not list. Read the app documentation first so the program uses real API names. The same program is never run twice on one document.',
  parameters: {
    type: 'object',
    properties: {
      openPath: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 60 } },
      open: { type: 'array', maxItems: 8, items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'], additionalProperties: false } },
      editorText: { type: 'string' },
      editor: { type: 'object', properties: { ref: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' } }, additionalProperties: false },
      editorKind: { type: 'string', enum: ['painted', 'field'] },
      run: { type: 'object', properties: { ref: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' } }, additionalProperties: false },
      clear: { type: 'object', properties: { ref: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' } }, additionalProperties: false },
      editorAt: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      text: { type: 'string', maxLength: 6000 },
      executeKey: { type: 'string' },
      executeAt: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
      expectOutput: { type: 'string' },
      clearSteps: { type: 'array', maxItems: 4, items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'], additionalProperties: false } },
      exportSteps: { type: 'array', maxItems: 8, items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'], additionalProperties: false } },
      documentId: { type: 'string' },
    },
    required: ['text', 'expectOutput'],
    additionalProperties: false,
  },
};
