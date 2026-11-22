// `demo`: records what the person does in this tab (their clicks, field changes and Enter presses, as role and name targets), so a task they show once can be
// repeated by the agent with semantic targets instead of coordinates. Recording happens in the page's probe; inputs the layer itself dispatched are taken out
// by the same one-to-one matching the human-control guard uses. Passwords, card numbers and one-time codes are never recorded (their value is "(hidden)").
// Pattern: VelvetAbyss/browser-agent-recorder @ 9e632a3 (MIT): capture, sanitise, then replay through the agent; written here for this layer.
import { recentAgentInput } from '../../host/cdp-session';
import type { DemoArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { unexplained, type SeenInput } from '../human-guard';
import { withPageState } from './navigate';

export interface DemoStep {
  t: number;
  kind: 'mouse' | 'key';
  x?: number;
  y?: number;
  step: 'click' | 'set' | 'press';
  role: string;
  name: string;
  value?: string;
  row?: string;
}

const startedAt = new Map<number, number>();

/** One line a person (and the model) can read and repeat: `set textbox "Email" = "ana@x.test"`, `click button "Save" (in "ana@x.test …")`. */
export function demoLine(s: Pick<DemoStep, 'step' | 'role' | 'name' | 'value' | 'row'>): string {
  const target = `${s.role} ${JSON.stringify(s.name || '(no name)')}`;
  const row = s.row ? ` (in ${JSON.stringify(s.row)})` : '';
  if (s.step === 'set') return `set ${target} = ${JSON.stringify(s.value ?? '')}${row}`;
  if (s.step === 'press') return `press ${s.value ?? 'Enter'} in ${target}`;
  return `click ${target}${row}`;
}

export async function demo(ctx: ToolContext, args: DemoArgs): Promise<ToolOutcome> {
  const attachment = await ctx.attach();
  const tab = ctx.tab();
  const main = (await attachment.topology.frames())[0];
  if (args.action === 'start') {
    await tab.probe!.callGlobal(main, 'startDemo');
    startedAt.set(tab.tabId, Date.now());
    return withPageState(ctx, 'none', {
      data: { recording: true },
      lines: ["demo · recording the user's clicks, field changes and Enter presses in this tab (passwords and card fields are never recorded)"],
    });
  }
  const steps = ((await tab.probe!.callGlobal<DemoStep[]>(main, 'stopDemo')) ?? []).slice(0, 300);
  const since = startedAt.get(tab.tabId) ?? Date.now() - 60 * 60_000;
  startedAt.delete(tab.tabId);
  // The layer's own inputs during the recording are not the person's.
  const agentInputs = recentAgentInput(tab.tabId, Date.now() - since + 2_000);
  const human = new Set(unexplained(steps as unknown as SeenInput[], agentInputs, true));
  const mine = steps.filter(s => human.has(s as unknown as SeenInput)).map(({ t: _t, x: _x, y: _y, kind: _k, ...rest }) => rest);
  return withPageState(ctx, 'none', {
    data: { steps: mine },
    lines: [`demo · ${mine.length} steps by the user`, ...mine.map((s, i) => `${i + 1}. ${demoLine(s)}`)],
  });
}
