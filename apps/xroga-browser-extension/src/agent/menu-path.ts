// menu_path: open a menu path such as File > Export > SVG in one call. Each item is clicked by name, the next item must appear before it is clicked, and the
// run stops at the first step that fails with a report of which step it was and which items the page does show. It works for any menu-driven application
// (nothing here knows a site), replaces one model turn per menu click, and every click still goes through the run's own gates.
export interface MenuStepResult { ok: boolean; text: string; errorCode?: string }
export type MenuCall = (tool: string, input: Record<string, unknown>) => Promise<MenuStepResult>;

export interface MenuPathArgs {
  /** Item names in order, for example ["Tools", "Scripts", "Scripts Panel"]. */
  path: string[];
  /** Text that must be on the page at the end (for example the panel title). Checked after the last click. */
  expect?: string;
}

const ROLES = ['menuitem', 'menuitemradio', 'menuitemcheckbox', 'button', 'tab', 'link', 'option'] as const;

export function validateMenuPath(a: Partial<MenuPathArgs>): string | null {
  if (!Array.isArray(a.path) || a.path.length === 0) return 'path must list at least one menu item name';
  if (a.path.length > 12) return 'path is at most 12 items';
  if (a.path.some(n => typeof n !== 'string' || !n.trim() || n.length > 80)) return 'every path item is a name of at most 80 characters';
  if (a.expect !== undefined && (typeof a.expect !== 'string' || a.expect.length > 120)) return 'expect is a short text';
  return null;
}

export interface MenuPathResult { ok: boolean; text: string; clicked: string[]; failedAt?: number }

export async function runMenuPath(args: MenuPathArgs, call: MenuCall): Promise<MenuPathResult> {
  const clicked: string[] = [];
  for (let i = 0; i < args.path.length; i++) {
    const name = args.path[i]!;
    // The item must be present (the previous click opens it). The first item is already there.
    if (i > 0) {
      const seen = await call('wait', { text: name, timeoutMs: 1500 });
      if (!seen.ok) return { ok: false, clicked, failedAt: i, text: `Stopped at step ${i + 1} of ${args.path.length}: "${name}" did not appear after clicking "${args.path[i - 1]}". The menu may have opened elsewhere, or the item has another name: take a snapshot or screenshot to see what is shown. Clicked so far: ${clicked.join(' > ') || 'nothing'}.` };
    }
    let done = false;
    let last: MenuStepResult = { ok: false, text: '' };
    for (const role of ROLES) {
      last = await call('click', { target: { role, name } });
      if (last.ok) { done = true; break; }
      // Only a "not found" moves on to the next role; any other failure (a covered control, a dialog, a refusal) is reported as it is.
      if (last.errorCode && !['NO_MATCH', 'AMBIGUOUS_TARGET'].includes(last.errorCode)) break;
    }
    if (!done) return { ok: false, clicked, failedAt: i, text: `Stopped at step ${i + 1} of ${args.path.length}: could not click "${name}" (${last.errorCode ?? 'failed'}: ${last.text.split('\n')[0].slice(0, 160)}). Clicked so far: ${clicked.join(' > ') || 'nothing'}.` };
    clicked.push(name);
  }
  if (args.expect) {
    const end = await call('wait', { text: args.expect, timeoutMs: 2000 });
    if (!end.ok) return { ok: false, clicked, failedAt: args.path.length, text: `The whole path was clicked (${clicked.join(' > ')}) but "${args.expect}" is not on the page: the wrong item may have been opened. Look at the page before going on.` };
  }
  return { ok: true, clicked, text: `Opened ${clicked.join(' > ')}${args.expect ? ` ("${args.expect}" is on the page)` : ''}.` };
}

export const MENU_PATH_TOOL = {
  name: 'menu_path',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Open a menu path in ONE call instead of one click per turn, in any application with menus: path is the item names in order, for example ["File","Export","SVG"] or ["Tools","Scripts","Scripts Panel"]. ' +
    'Each next item must appear before it is clicked; it stops at the first step that fails and says which one. Give expect (text that should be on the page at the end) to be told if a wrong item opened.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'array', items: { type: 'string', maxLength: 80 }, minItems: 1, maxItems: 12 },
      expect: { type: 'string', maxLength: 120 },
    },
    required: ['path'],
    additionalProperties: false,
  },
};
