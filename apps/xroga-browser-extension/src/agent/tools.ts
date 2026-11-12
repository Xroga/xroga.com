// The agent's tools: the layer's catalogue as it is, plus the agent's own. One list for every model; `screenshot` is
// offered to vision models only, and page script, devtools and uploads from a path are not in the list at all.
import { argsJsonSchema, isReadOnly, TOOL_SPECS } from '@src/browser-control';
import type { ToolDefinition } from '@src/llm';
import { READ_ATTACHMENT_TOOL } from './attachments';
import { SAVE_FILE_TOOL } from './save-file';

export type ToolKind = 'read' | 'wait' | 'mutate' | 'control' | 'state';

export interface AgentTool extends ToolDefinition {
  name: string;
  /** Where it comes from: the layer runs it, or the agent itself. */
  source: 'layer' | 'agent';
  /** The group the tool belongs to. */
  group: 'reading' | 'acting' | 'files' | 'working';
  /** `snapshot` and `done`: a run always has them, even with `disabled`. */
  required?: boolean;
}

/** Tools of the layer the agent never gets: page script, devtools, coordinates and selectors. */
const NOT_OFFERED = new Set(['eval', 'devtools']);

const GROUPS: Record<string, AgentTool['group']> = {
  snapshot: 'reading',
  find: 'reading',
  read: 'reading',
  screenshot: 'reading',
  wait: 'reading',
  click: 'acting',
  set: 'acting',
  type: 'acting',
  press: 'acting',
  navigate: 'acting',
  handle_dialog: 'acting',
  fill_form: 'acting',
  hover: 'acting',
  drag: 'acting',
  scroll: 'acting',
  tabs: 'acting',
  ask_user: 'working',
  upload: 'files',
};

/** Parameters the wrapper sets or the session decides, removed from what the model sees. */
const HIDDEN: Record<string, string[]> = {
  '*': ['observe'],
  ask_user: ['timeoutMs'],
  // The agent names attached files by id; the wrapper turns them into bytes.
  upload: ['paths', 'attachments'],
};

/** What the model gives `upload` in place of paths or bytes: the ids of files the user attached. */
const ATTACHMENT_IDS = {
  type: 'array',
  items: { type: 'string' },
  minItems: 1,
  maxItems: 20,
  description: 'Ids of files the user attached to this conversation, as the note about the attached files lists them',
};

function withAttachmentIds(schema: unknown): unknown {
  const s = schema as { properties?: Record<string, unknown>; required?: string[] };
  return {
    ...s,
    properties: { ...s.properties, attachmentIds: ATTACHMENT_IDS },
    required: [...(s.required ?? []), 'attachmentIds'],
  };
}

function schemaWithout(schema: unknown, hidden: string[]): unknown {
  const s = { ...(schema as Record<string, unknown>) };
  delete s.$schema;
  if (s.properties && typeof s.properties === 'object') {
    const props = { ...(s.properties as Record<string, unknown>) };
    for (const h of hidden) delete props[h];
    s.properties = props;
    if (Array.isArray(s.required)) s.required = (s.required as string[]).filter(r => !hidden.includes(r));
  }
  return s;
}

const SAFE_INT = 9007199254740991;

/**
 * What the model sees of a tool's schema, without what it can never use: the integer bounds that only restate the language's
 * limits, the target forms for a CSS selector or screen coordinates (the agent is not offered selectors or pixel clicks, and the
 * layer still checks every call against its own full schema), and the timeout, which the layer sets. Every model turn pays for the
 * catalogue, so a smaller schema is a faster turn.
 */
/** The names of a postcondition's fields say what they check; their one-line descriptions only cost tokens. */
function withoutLeafDescriptions(schema: unknown): unknown {
  const s = schema as { properties?: Record<string, Record<string, unknown>> };
  if (!s?.properties) return schema;
  const properties = Object.fromEntries(
    Object.entries(s.properties).map(([name, value]) => [name, Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'description'))]),
  );
  return { ...s, properties };
}

/**
 * The postconditions with a nested query (exists, count) are shown to the model as plain objects: their shape is in one line of the system prompt,
 * and the layer checks every call against its own full schema, so the catalogue does not pay for the nested shape in every action tool.
 */
function looseNested(schema: unknown): unknown {
  const s = schema as { properties?: Record<string, unknown> };
  if (!s?.properties) return schema;
  const properties = { ...s.properties };
  for (const name of ['exists', 'count']) if (name in properties) properties[name] = { type: 'object' };
  return { ...s, properties };
}

export function compactSchema(schema: unknown, tool = ''): unknown {
  const walk = (node: unknown, key = ''): unknown => {
    if (Array.isArray(node)) return node.map(n => walk(n));
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((k === 'minimum' && v === -SAFE_INT) || (k === 'maximum' && v === SAFE_INT)) continue;
      if (k === 'anyOf' && Array.isArray(v) && key === 'target') {
        const kept = v.filter(variant => {
          const required = (variant as { required?: string[] }).required ?? [];
          return !required.includes('selector') && !(required.includes('x') && required.includes('y'));
        });
        out[k] = kept.length ? kept.map(n => walk(n)) : v.map(n => walk(n));
        continue;
      }
      if (k === 'properties' && v && typeof v === 'object') {
        const props: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(v as Record<string, unknown>)) {
          if (name === 'timeoutMs' && tool !== 'wait') continue;
          props[name] = name === 'expect' ? looseNested(withoutLeafDescriptions(walk(value, name))) : walk(value, name);
        }
        out[k] = props;
        continue;
      }
      out[k] = walk(v, k);
    }
    return out;
  };
  return walk(schema);
}

export const DONE_TOOL: AgentTool = {
  name: 'done',
  source: 'agent',
  group: 'working',
  required: true,
  description:
    'Finish the task and report to the user. outcome "success" only when you have seen the result of every action you took; otherwise "partial" or "failed". The summary is your final answer to the user.',
  parameters: {
    type: 'object',
    properties: {
      outcome: { type: 'string', enum: ['success', 'partial', 'failed'] },
      summary: { type: 'string', description: 'The answer for the user, in Markdown' },
    },
    required: ['outcome', 'summary'],
    additionalProperties: false,
  },
};

/** Every tool the agent can have, before switches and capabilities. */
export function allTools(agentTools: AgentTool[] = []): AgentTool[] {
  const layer = TOOL_SPECS.filter(spec => spec.available && !NOT_OFFERED.has(spec.name) && GROUPS[spec.name]).map(
    spec =>
      ({
        name: spec.name,
        source: 'layer',
        group: GROUPS[spec.name],
        required: spec.name === 'snapshot',
        description: spec.description,
        parameters: ((p: unknown) => (spec.name === 'upload' ? withAttachmentIds(p) : p))(
          compactSchema(schemaWithout(argsJsonSchema(spec), [...HIDDEN['*'], ...(HIDDEN[spec.name] ?? [])]), spec.name),
        ),
      }) satisfies AgentTool,
  );
  return [...layer, DONE_TOOL, READ_ATTACHMENT_TOOL, SAVE_FILE_TOOL, ...agentTools];
}

/**
 * The tools a run gets: every tool the model can use. The run keeps this list from start to end, so its prompt prefix
 * stays cached; it is checked again at dispatch. `disabled` is for the unit tests and scenario sets, which test that
 * check and keep requests small; the product never passes it.
 */
export function toolsForRun(options: {
  disabled?: readonly string[];
  vision: boolean;
  localScreenshots?: boolean;
  agentTools?: AgentTool[];
}): AgentTool[] {
  return allTools(options.agentTools)
    .filter(
      t =>
        (t.required || !options.disabled?.includes(t.name)) &&
        (t.name !== 'screenshot' || options.vision || options.localScreenshots),
    )
    .map(t =>
      t.name === 'screenshot' && options.localScreenshots && !options.vision
        ? {
            ...t,
            description:
              'Capture a redacted screenshot for the user to view locally. Use when requested or needed as evidence. You receive only capture metadata, so use snapshot or read to inspect the page.',
          }
        : t,
    );
}

/** The kind of a call, for the execution policy. `tabs select` is ordered as a mutation. */
export function kindOf(tool: string, args: Record<string, unknown>): ToolKind {
  if (tool === 'done' || tool === 'ask_user') return 'control';
  if (tool === 'wait') return 'wait';
  if (tool === 'enable_actions' || tool === 'delegate') return 'read';
  // Starting workers opens windows and runs: it is fenced like other effects. Reading their status is a read.
  if (tool === 'parallel_task_status') return 'read';
  // A batch may contain writes: it is fenced like one, and its steps are checked and recorded one by one.
  if (tool === 'batch') return 'mutate';
  if (tool === 'start_parallel_tasks') return 'mutate';
  if (tool === 'save_file') return 'state';
  if (tool === 'read_attachment' || tool === 'plugin_search' || tool === 'plugin_action_search') return 'read';
  // An approved connected read can transmit private arguments. Fence it like a dispatched effect on recovery.
  if (tool === 'plugin_read') return 'mutate';
  if (tool === 'tabs') return args.action === 'list' ? 'read' : 'mutate';
  const spec = TOOL_SPECS.find(s => s.name === tool);
  if (!spec) return 'mutate';
  return isReadOnly(spec, args) ? 'read' : 'mutate';
}

/** Page actions that create verification debt. */
export const PAGE_ACTIONS = new Set([
  'click',
  'set',
  'fill_form',
  'type',
  'press',
  'hover',
  'drag',
  'scroll',
  'navigate',
  'handle_dialog',
  'upload',
]);
