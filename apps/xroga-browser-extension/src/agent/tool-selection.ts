// The tools a run starts with. The action tools (click, type, forms, scroll, upload and the rest) are about three quarters of the
// tool catalogue's size, and every model turn pays for the catalogue. A request that only asks to read something starts without them
// and with `enable_actions`, which the model calls once if the task turns out to need them: the run then has the full list.
import type { AgentTool } from './tools';

/** Tools left out of a read-only start. Reading, navigation, tabs, waiting and the control tools stay. */
export const ACTION_TOOLS: ReadonlySet<string> = new Set([
  'click',
  'set',
  'fill_form',
  'type',
  'press',
  'hover',
  'drag',
  'scroll',
  'upload',
  'handle_dialog',
]);

export const ENABLE_ACTIONS_TOOL: AgentTool = {
  name: 'enable_actions',
  source: 'agent',
  group: 'working',
  description:
    'Turn on the tools that click, type, fill forms, scroll, upload and handle dialogs. Call it once, only if the task needs one of them; reading and opening pages do not.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};

/** Opening a site that the request names is not an action on a page; opening anything else ("open the catalog") is. */
const OPEN_SITE = /\b(?:go to|goto|open|visit|navigate to|browse to|head to|load)\s+(?:https?:\/\/\S+|(?:[\w-]+\.)+[a-z]{2,}\S*)/gi;
const NEGATED = /\b(?:do not|don't|dont|never|without|no need to)\b[^.!?\n]*/gi;
const ACTION =
  /\b(?:open|go to|goto|visit|navigate|browse|click|tap|press|type|enter|fill|submit|select|choose|tick|log ?in|sign ?(?:in|up)|register|buy|purchase|order|checkout|add to (?:cart|basket)|book|reserve|send|post|publish|create|delete|remove|upload|attach|download|drag|play|filter|sort|search for|search the|scroll|paginate|next page|apply|save|edit|update|change|toggle|turn (?:on|off)|fill out|fill in)\b/i;
const READ_CUE =
  /\b(?:tell me|what(?:'s| is| are)|heading|headline|title|read|summari[sz]e|summary|extract|list|compare|price|find out|show me|report|look up|check (?:what|whether|if)|describe|url|address|who|when|where|how many)\b/i;

/**
 * Whether a request only asks to read: it names no action, and its words say what to find out. What the user forbids ("do not click or
 * type anything") is not an action the request asks for. Anything unclear is not read-only, so the run keeps every tool.
 */
export function isReadOnlyRequest(request: string): boolean {
  const text = request.replace(NEGATED, ' ').replace(OPEN_SITE, ' ');
  return READ_CUE.test(text) && !ACTION.test(text);
}

/** The tool list a run starts with, and the full list to switch to when the model calls `enable_actions`. */
export function startingTools(full: AgentTool[], request: string): { tools: AgentTool[]; full?: AgentTool[] } {
  if (!isReadOnlyRequest(request)) return { tools: full };
  return { tools: [...full.filter(t => !ACTION_TOOLS.has(t.name)), ENABLE_ACTIONS_TOOL], full };
}
