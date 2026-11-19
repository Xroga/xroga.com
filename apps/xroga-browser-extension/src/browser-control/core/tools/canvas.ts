// `canvas`: pointer actions at a place on a canvas the page paints itself (vector, video and design editors, games, maps), where there is
// no element to target. The place is given as fractions of the page as the last screenshot shows it. Safety is kept by construction:
//   - the point must be ON a <canvas> (a hit test before any event), so a real control (a button, a link, a field) can never be
//     reached this way and keeps its guarded `click`, with the payment, destructive and sending checks;
//   - the model's stated intent is screened for consequential words, which need the user;
//   - a dialog on the tab stops it, as for every other action.
import { LayerError } from '../../protocol/errors';
import type { CanvasArgs } from '../../protocol/schemas';
import type { ActionReceipt } from '../../protocol/results';
import type { ToolContext, ToolOutcome } from '../controller';
import { checkCancelled } from '../controller';
import { dispatchDrag, dispatchHover } from '../interaction/pointer';
import { withPageState } from './navigate';
import { quote } from '../text';

const CONSEQUENTIAL = /\b(?:pay|payment|purchase|buy|checkout|place (?:the )?order|delete|remove|erase|send|publish|post|submit|transfer|subscribe)\b/i;

interface Viewport {
  width: number;
  height: number;
}

async function viewportOf(ctx: ToolContext): Promise<Viewport> {
  const attachment = await ctx.attach();
  const frames = await attachment.topology.frames();
  const viewport = await ctx.tab().probe!.callGlobal<Viewport>(frames[0], 'viewport');
  if (!viewport?.width || !viewport?.height) throw new LayerError('CAPTURE_FAILED', 'The page has no measurable viewport, so a point on it cannot be placed.');
  return viewport;
}

/** The node under a point must be a canvas. Throws with the real element's name so the model uses the guarded tool for it. */
async function assertCanvasAt(ctx: ToolContext, x: number, y: number): Promise<void> {
  const { cdp } = await ctx.attach();
  let name = '';
  try {
    const hit = await cdp.send<{ backendNodeId: number }>(undefined, 'DOM.getNodeForLocation', { x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: false });
    const described = await cdp.send<{ node: { nodeName: string } }>(undefined, 'DOM.describeNode', { backendNodeId: hit.backendNodeId });
    name = described.node.nodeName;
  } catch (error) {
    throw new LayerError('NOT_VISIBLE', `Nothing could be found at that point (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (name.toUpperCase() !== 'CANVAS') {
    throw new LayerError(
      'TARGET_CHANGED',
      `That point is on <${name.toLowerCase()}>, a page element, not on a canvas. Nothing was dispatched. Use click, hover or drag with a ref or a role and name for page elements.`,
    );
  }
}

async function rawClick(ctx: ToolContext, x: number, y: number, button: 'left' | 'right', count: number): Promise<void> {
  const { cdp } = await ctx.attach();
  ctx.tab().actionSeq++;
  await cdp.send(undefined, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (let n = 1; n <= count; n++) {
    await cdp.send(undefined, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: n });
    await cdp.send(undefined, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: n });
  }
}

export async function canvas(ctx: ToolContext, args: CanvasArgs): Promise<ToolOutcome> {
  checkCancelled(ctx);
  if (ctx.tab().pending.length) {
    throw new LayerError('MODAL_PENDING', `A ${ctx.tab().pending[0].kind} is open on this tab: ${ctx.tab().pending[0].detail}`);
  }
  if (CONSEQUENTIAL.test(args.intent)) {
    throw new LayerError('USER_STEP', `The stated purpose (${quote(args.intent, 80)}) names a consequential step. Ask the user to do it, or use the guarded click on the real control.`);
  }
  if (args.action === 'drag' && !args.to) throw new LayerError('INVALID_ARGUMENT', 'A drag needs `to`, the place where it ends.');
  const viewport = await viewportOf(ctx);
  const at = { x: args.at[0] * viewport.width, y: args.at[1] * viewport.height };
  await assertCanvasAt(ctx, at.x, at.y);
  const end = args.to ? { x: args.to[0] * viewport.width, y: args.to[1] * viewport.height } : undefined;
  if (end) await assertCanvasAt(ctx, end.x, end.y);
  if (args.action === 'click') await rawClick(ctx, at.x, at.y, 'left', 1);
  else if (args.action === 'double_click') await rawClick(ctx, at.x, at.y, 'left', 2);
  else if (args.action === 'right_click') await rawClick(ctx, at.x, at.y, 'right', 1);
  else if (args.action === 'hover') await dispatchHover(ctx, at);
  else await dispatchDrag(ctx, at, end!);
  const receipt: ActionReceipt = {
    action: `canvas ${args.action}`,
    target: `canvas ${quote(args.intent, 80)} at [${args.at.map(n => n.toFixed(3)).join(', ')}]${args.to ? ` to [${args.to.map(n => n.toFixed(3)).join(', ')}]` : ''}`,
    mechanism: 'pointer',
    dispatched: true,
    effect: { verdict: 'unattributable', signals: ['A canvas paints its own result; take a screenshot to see whether the action did what was meant.'] },
  };
  return withPageState(ctx, args.observe, { receipt, data: { point: at, ...(end ? { to: end } : {}) } });
}
