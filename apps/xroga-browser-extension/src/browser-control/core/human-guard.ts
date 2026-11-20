// Concurrent human control. The page's probe records trusted input that arrives outside the agent's own dispatch window; before a tool that changes the page
// the layer waits for the person to stop (they are using this tab), and refuses with MODAL_PENDING if they do not stop. Reads are never held back.
// Any failure to ask the page (a frame gone, no probe yet) lets the action go: this guard must never be the reason a run cannot work.
import { LayerError } from '../protocol/errors';
import type { ToolContext } from './controller';

/** The person counts as active when they touched the page less than this long ago. */
export const HUMAN_QUIET_MS = 2_500;
/** How long an action waits for the person to stop before it is refused. */
export const HUMAN_WAIT_MS = 15_000;

/** Only an already attached tab is asked: this guard never attaches a tab itself (a navigation from a page the debugger cannot attach to must stay as it is). */
async function mainFrame(ctx: ToolContext) {
  const tab = ctx.tab();
  if (!tab.attachment || !tab.probe) return { probe: null, main: undefined };
  const frames = await tab.attachment.topology.frames();
  return { probe: tab.probe, main: frames[0] };
}

/** Opens the agent's dispatch window, so the events its own tool sends are not mistaken for the person's. */
export async function markAgentWindow(ctx: ToolContext, ms: number): Promise<void> {
  try {
    const { probe, main } = await mainFrame(ctx);
    if (probe && main) await probe.callGlobal<boolean>(main, 'agentWindow', ms);
  } catch {
    /* the page cannot be asked: nothing to mark */
  }
}

/** Waits until the person has been quiet for HUMAN_QUIET_MS; throws MODAL_PENDING when they keep using the tab. */
export async function waitForHumanQuiet(ctx: ToolContext, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<void> {
  let waited = 0;
  for (;;) {
    let quiet = Number.POSITIVE_INFINITY;
    try {
      const { probe, main } = await mainFrame(ctx);
      if (probe && main) quiet = await probe.callGlobal<number>(main, 'humanQuiet');
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
