// Concurrent human control. Every frame's probe records the trusted input its document received (mouse presses, keys, wheel, touch, with where
// pointer input landed). The layer logs every input it dispatches itself (all CDP traffic goes through sendRaw). An event that no agent input
// explains is the person's. Before a tool that changes the page the layer waits for the person to stop, and refuses with MODAL_PENDING when they
// keep going. Reads are never held back. Any failure to ask a frame lets the action go: this guard must never be the reason a run cannot work.
//
// Matching: an agent input of the same kind within MATCH_MS. In the top frame a pointer event must also land where the agent aimed (CSS pixels;
// a uniform page zoom is allowed for). In a subframe the coordinates are the frame's own, so the kind and the time decide.
import { LayerError } from '../protocol/errors';
import { recentAgentInput, type AgentInput } from '../host/cdp-session';
import type { ToolContext } from './controller';

/** The person counts as active when they touched the page less than this long ago. */
export const HUMAN_QUIET_MS = 2_500;
/** How long an action waits for the person to stop before it is refused. */
export const HUMAN_WAIT_MS = 15_000;
const MATCH_MS = 600;

export interface SeenInput { t: number; kind: AgentInput['kind']; x?: number; y?: number }

/** Whether one of the agent's own inputs explains an event the page saw. */
export function explainedByAgent(e: SeenInput, agent: AgentInput[], topFrame: boolean): boolean {
  return agent.some(a => {
    if (Math.abs(a.t - e.t) > MATCH_MS) return false;
    const kind = a.kind === e.kind || (a.kind === 'mouse' && e.kind === 'touch');
    if (!kind) return false;
    if (!topFrame || e.kind === 'key' || a.x === undefined || e.x === undefined || a.y === undefined || e.y === undefined) return true;
    if (Math.abs(a.x - e.x) <= 3 && Math.abs(a.y - e.y) <= 3) return true;
    // A zoomed page reports clientX = x / zoom: the same ratio on both axes.
    if (e.x > 0 && e.y > 0) {
      const rx = a.x / e.x;
      const ry = a.y / e.y;
      return rx > 0.2 && rx < 5 && Math.abs(rx - ry) / rx < 0.03;
    }
    return false;
  });
}

/** Milliseconds since the person last used this tab, in any attached frame (infinite when never, or when it cannot be told). */
export async function humanQuietMs(ctx: ToolContext): Promise<number> {
  const tab = ctx.tab();
  if (!tab.attachment || !tab.probe) return Number.POSITIVE_INFINITY;
  const frames = await tab.attachment.topology.frames();
  const agent = recentAgentInput(tab.tabId, HUMAN_QUIET_MS + MATCH_MS + 1000);
  let last = 0;
  await Promise.all(
    frames.map(async (frame, i) => {
      const seen = await tab.probe!.callGlobal<SeenInput[]>(frame, 'recentInput', HUMAN_QUIET_MS + 500).catch(() => [] as SeenInput[]);
      for (const e of seen ?? []) if (!explainedByAgent(e, agent, i === 0)) last = Math.max(last, e.t);
    }),
  );
  return last ? Date.now() - last : Number.POSITIVE_INFINITY;
}

/** Waits until the person has been quiet for HUMAN_QUIET_MS; throws MODAL_PENDING when they keep using the tab. */
export async function waitForHumanQuiet(ctx: ToolContext, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<void> {
  let waited = 0;
  for (;;) {
    let quiet = Number.POSITIVE_INFINITY;
    try {
      quiet = await humanQuietMs(ctx);
    } catch {
      return;
    }
    if (quiet >= HUMAN_QUIET_MS) return;
    if (waited >= HUMAN_WAIT_MS) {
      throw new LayerError(
        'MODAL_PENDING',
        `The user is using this tab right now (they last touched it ${Math.round(quiet / 100) / 10} s ago), so nothing was done. Tell the user you are waiting, then try again when they have stopped, or work in another tab.`,
      );
    }
    const step = Math.min(500, HUMAN_QUIET_MS - quiet);
    await sleep(step);
    waited += step;
  }
}
