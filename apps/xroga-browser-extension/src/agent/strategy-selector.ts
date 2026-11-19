// Evidence-based execution strategy selection. The choice comes from what the current page actually shows (an outline of interactive elements, painted
// canvases, a script or command surface, connected tools, a matching verified skill), never from keywords in the request alone. Pure and cheap: no model call.
// The ranked list is the order the progress tracker walks when a method stalls, so a canvas editor starts visual and a form starts on DOM controls.
import type { Strategy } from './progress-tracker';

export interface PageEvidence {
  /** Interactive elements in the latest outline (buttons, links, fields, menu items, tabs, rows). */
  interactive: number;
  /** Fields and selects, which a batch can fill in one call. */
  fields: number;
  /** Painted surfaces: canvas elements and graphical editor regions named in the outline. */
  canvases: number;
  /** A script, macro, console or command surface is visible or named. */
  commandSurface: boolean;
  /** A connected app or official API tool is available for this kind of task. */
  connectedTool: boolean;
  /** A verified playbook matches this task (a skill with a tested procedure). */
  verifiedSkill: boolean;
  /** The model can see screenshots. */
  vision: boolean;
  /** The outline is empty or nearly so: the page may be a painted app or still loading. */
  sparse: boolean;
}

export interface Ranked {
  strategy: Strategy;
  score: number;
  reasons: string[];
}

/** Estimated cost per step (model calls, relative). These are design estimates used only as tie-breaks, not measurements. */
export const RELATIVE_COST: Record<Strategy, number> = {
  CONNECTED_TOOL: 1,
  DOM_BATCH: 1.5,
  DOM_A11Y: 2,
  APP_NATIVE: 2,
  VISUAL_GUI: 4,
  RECOVERY: 5,
};

const INTERACTIVE = /\b(?:button|link|textbox|searchbox|combobox|checkbox|radio|switch|menuitem|menuitemcheckbox|tab|option|slider|spinbutton)\b/gi;
const FIELD = /\b(?:textbox|searchbox|combobox|checkbox|radio|switch|spinbutton|slider)\b/gi;
const CANVAS = /\bcanvas\b|\b(?:img|image|graphics-document|application)\b[^\n]{0,80}\b(?:canvas|editor|timeline|viewport|artboard|stage|drawing|design)\b/gi;
const COMMAND_SURFACE = /\b(?:scripts?|scripting|console|macros?|command palette|command bar|run script|formula bar|terminal)\b/i;

/** Reads evidence out of an accessibility outline (the text the layer returns). Counts only; nothing here interprets page text as instructions. */
export function evidenceFromOutline(outline: string, extra: Partial<Pick<PageEvidence, 'connectedTool' | 'verifiedSkill' | 'vision'>> = {}): PageEvidence {
  const text = outline ?? '';
  const interactive = text.match(INTERACTIVE)?.length ?? 0;
  const fields = text.match(FIELD)?.length ?? 0;
  const canvases = text.match(CANVAS)?.length ?? 0;
  return {
    interactive,
    fields,
    canvases,
    commandSurface: COMMAND_SURFACE.test(text),
    connectedTool: !!extra.connectedTool,
    verifiedSkill: !!extra.verifiedSkill,
    vision: !!extra.vision,
    sparse: interactive < 4,
  };
}

/** Ranks strategies from the evidence. The top entry is where the run starts; the rest is the order it falls back through. RECOVERY is always last. */
export function rankStrategies(e: PageEvidence): Ranked[] {
  const s = new Map<Strategy, Ranked>();
  const add = (strategy: Strategy, score: number, reason: string) => {
    const cur = s.get(strategy) ?? { strategy, score: 0, reasons: [] };
    cur.score += score;
    cur.reasons.push(reason);
    s.set(strategy, cur);
  };
  add('DOM_A11Y', 3, 'default for pages with structured controls');
  add('DOM_BATCH', 1, 'known steps can run locally in one call');
  add('VISUAL_GUI', e.vision ? 0 : -6, e.vision ? 'fallback that reads the screenshot' : 'the model cannot see screenshots');
  add('APP_NATIVE', 0, 'app commands or scripting');
  if (e.connectedTool) add('CONNECTED_TOOL', 10, 'an authorized connected tool or API covers this work');
  if (e.interactive >= 12) add('DOM_A11Y', 3, `${e.interactive} interactive elements are exposed`);
  if (e.fields >= 4) add('DOM_BATCH', 5, `${e.fields} fields can be filled as one local batch`);
  if (e.canvases > 0 && e.interactive < 25) {
    add('VISUAL_GUI', e.vision ? 8 : 2, `${e.canvases} painted surface(s) and few exposed controls`);
    add('DOM_A11Y', -3, 'a painted surface hides its objects from the outline');
  }
  if (e.sparse) {
    add('VISUAL_GUI', e.vision ? 6 : 1, 'the outline is nearly empty, the page is painted or still loading');
    add('DOM_A11Y', -2, 'almost nothing to act on in the outline');
  }
  if (e.commandSurface) add('APP_NATIVE', e.verifiedSkill ? 9 : 5, e.verifiedSkill ? 'a command surface is present and a verified procedure exists' : 'a script or command surface is present');
  const ranked = [...s.values()];
  // RECOVERY is never a starting point.
  const recovery = ranked.find(r => r.strategy === 'RECOVERY') ?? { strategy: 'RECOVERY' as Strategy, score: -100, reasons: ['inspect, undo duplicates, continue from the verified state'] };
  const rest = ranked.filter(r => r.strategy !== 'RECOVERY');
  rest.sort((a, b) => b.score - a.score || RELATIVE_COST[a.strategy] - RELATIVE_COST[b.strategy]);
  return [...rest, recovery];
}

export function describeChoice(ranked: Ranked[]): string {
  const top = ranked[0]!;
  return `Method chosen from what the page shows: ${top.strategy} (${top.reasons.join('; ')}). If it stalls the order is ${ranked.map(r => r.strategy).join(' > ')}.`;
}
