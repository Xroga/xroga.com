// `record_demo`: learn a task by watching the person do it once. Start records their clicks, field changes and Enter presses in the current tab (through the
// layer's `demo` tool); stop returns the steps as role and name targets the agent can repeat with batch, and keeps them on this device under a name, per site,
// so a later run on the same site can list and reuse them. Values typed in the demonstration are examples, not instructions: a replay uses the values of the
// new request. Nothing leaves the device; secrets are never recorded.
import { demoLine } from '@src/browser-control/core/tools/demo';

export const DEMOS_KEY = 'xroga_demos_v1';
const MAX_DEMOS = 50;

export interface SavedDemo {
  origin: string;
  name: string;
  savedAt: number;
  steps: Array<{ step: 'click' | 'set' | 'press'; role: string; name: string; value?: string; row?: string }>;
}

export const RECORD_DEMO_TOOL = {
  name: 'record_demo',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Learn a task by watching the user do it in the current tab, when they offer to show you or ask you to record it. action "start" records their clicks, field changes and Enter presses (passwords and card fields are never recorded); then ask the user to do the task and to tell you when they are done. action "stop" returns the steps as role and name targets you can repeat with batch, and keeps them under name for this site. action "list" shows the demonstrations kept for the site of the current tab.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['start', 'stop', 'list'] },
      name: { type: 'string', maxLength: 80, description: 'stop: a short name for the task shown, such as "create a CRM contact"' },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

async function load(): Promise<SavedDemo[]> {
  try {
    const v = (await chrome.storage.local.get(DEMOS_KEY))[DEMOS_KEY];
    return Array.isArray(v) ? (v as SavedDemo[]) : [];
  } catch {
    return [];
  }
}

export async function saveDemo(demo: SavedDemo): Promise<void> {
  try {
    const list = (await load()).filter(d => !(d.origin === demo.origin && d.name.toLowerCase() === demo.name.toLowerCase()));
    list.unshift(demo);
    await chrome.storage.local.set({ [DEMOS_KEY]: list.slice(0, MAX_DEMOS) });
  } catch {
    /* a demonstration that cannot be kept is still returned to the run */
  }
}

export async function demosFor(origin: string): Promise<SavedDemo[]> {
  return (await load()).filter(d => d.origin === origin);
}

/** The text a stop or a list returns: numbered steps and how to repeat them. */
export function renderDemo(name: string, steps: SavedDemo['steps']): string {
  if (!steps.length) return `No steps were recorded for "${name}". The user may not have used this tab, or only typed into fields without leaving them.`;
  return [
    `Demonstration "${name}" (${steps.length} steps). Values are examples from the demonstration; use the values of the current request:`,
    ...steps.map((s, i) => `${i + 1}. ${demoLine(s)}`),
    'To repeat it, use batch with the same role and name targets (row context where shown), checking the result after the last step.',
  ].join('\n');
}
