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

const CONSEQUENTIAL = /\b(?:pay|payment|purchase|buy|checkout|place (?:the )?order|delete|remove|erase|send|publish|post|submit|transfer|subscribe|password|passcode|card number|cvv|one-time code|otp)\b/i;

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

const KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: 'Enter', vk: 13, text: '\r' }, Tab: { code: 'Tab', vk: 9 }, Escape: { code: 'Escape', vk: 27 }, Backspace: { code: 'Backspace', vk: 8 },
  Delete: { code: 'Delete', vk: 46 }, ArrowLeft: { code: 'ArrowLeft', vk: 37 }, ArrowUp: { code: 'ArrowUp', vk: 38 }, ArrowRight: { code: 'ArrowRight', vk: 39 },
  ArrowDown: { code: 'ArrowDown', vk: 40 }, Home: { code: 'Home', vk: 36 }, End: { code: 'End', vk: 35 }, ' ': { code: 'Space', vk: 32, text: ' ' },
};
for (let n = 1; n <= 12; n++) KEYS[`F${n}`] = { code: `F${n}`, vk: 111 + n };

function keyInfo(name: string): { key: string; code: string; vk: number; text?: string } {
  if (KEYS[name]) return { key: name, ...KEYS[name] };
  if (/^[a-z]$/i.test(name)) return { key: name.toLowerCase(), code: `Key${name.toUpperCase()}`, vk: name.toUpperCase().charCodeAt(0) };
  if (/^[0-9]$/.test(name)) return { key: name, code: `Digit${name}`, vk: name.charCodeAt(0) };
  throw new LayerError('INVALID_ARGUMENT', `Unknown key ${quote(name, 20)}. Use Enter, Tab, Escape, Backspace, Delete, an arrow, F1 to F12, a letter or a digit, with Control, Shift or Alt.`);
}

/**
 * Where keyboard input may go. A painted editor takes text either on its canvas or through a hidden text box it keeps focused for the
 * keyboard (zero-size, transparent or off-screen); both are the application's own input path. A visible field, a password field, a
 * link or a button is a page element: it keeps the guarded type and press, with their checks.
 */
export function focusAcceptsPaintedInput(f: { tag: string; type?: string; w: number; h: number; opacity: number; offscreen: boolean; editable: boolean; bigCanvas: boolean }): boolean {
  const tag = f.tag.toUpperCase();
  if (tag === 'CANVAS') return true;
  if (!f.bigCanvas || f.type === 'password') return false;
  const textTarget = tag === 'TEXTAREA' || tag === 'INPUT' || f.editable;
  const hidden = f.w * f.h < 16 || f.opacity < 0.1 || f.offscreen;
  return textTarget && hidden;
}

async function assertCanvasFocused(ctx: ToolContext): Promise<void> {
  const { cdp } = await ctx.attach();
  const expression = `(() => { const e = document.activeElement; if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    const big = [...document.querySelectorAll('canvas')].some(c => { const q = c.getBoundingClientRect(); return q.width * q.height > 0.25 * innerWidth * innerHeight; });
    return { tag: e.tagName, type: e.type || '', w: r.width, h: r.height, opacity: parseFloat(cs.opacity), offscreen: r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight, editable: !!e.isContentEditable, bigCanvas: big }; })()`;
  const result = await cdp.send<{ result: { value?: Parameters<typeof focusAcceptsPaintedInput>[0] | null } }>(undefined, 'Runtime.evaluate', { expression, returnByValue: true });
  const focus = result.result?.value;
  if (!focus || !focusAcceptsPaintedInput(focus)) {
    const name = focus?.tag ? `<${focus.tag.toLowerCase()}>` : 'nothing';
    throw new LayerError('TARGET_CHANGED', `Keyboard focus is on ${name}, which is a page element or nothing, not the painted editor's own input. Nothing was sent. Click inside the editor first (canvas click), then retry; use type or press for page fields.`);
  }
}

async function sendKey(ctx: ToolContext, chord: string): Promise<void> {
  const { cdp } = await ctx.attach();
  const parts = chord.split('+').map(p => p.trim()).filter(Boolean);
  const name = parts.pop() ?? '';
  let modifiers = 0;
  for (const m of parts) {
    if (/^alt$/i.test(m)) modifiers |= 1;
    else if (/^(control|ctrl)$/i.test(m)) modifiers |= 2;
    else if (/^(meta|cmd)$/i.test(m)) modifiers |= 4;
    else if (/^shift$/i.test(m)) modifiers |= 8;
    else throw new LayerError('INVALID_ARGUMENT', `Unknown modifier ${quote(m, 20)}`);
  }
  const info = keyInfo(name);
  ctx.tab().actionSeq++;
  const base = { modifiers, key: info.key, code: info.code, windowsVirtualKeyCode: info.vk, nativeVirtualKeyCode: info.vk };
  await cdp.send(undefined, 'Input.dispatchKeyEvent', { type: info.text && !modifiers ? 'keyDown' : 'rawKeyDown', ...base, ...(info.text && !modifiers ? { text: info.text } : {}) });
  await cdp.send(undefined, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

export async function canvas(ctx: ToolContext, args: CanvasArgs): Promise<ToolOutcome> {
  checkCancelled(ctx);
  if (ctx.tab().pending.length) {
    throw new LayerError('MODAL_PENDING', `A ${ctx.tab().pending[0].kind} is open on this tab: ${ctx.tab().pending[0].detail}`);
  }
  if (CONSEQUENTIAL.test(args.intent)) {
    throw new LayerError('USER_STEP', `The stated purpose (${quote(args.intent, 80)}) names a consequential step. Ask the user to do it, or use the guarded click on the real control.`);
  }
  if (args.action === 'type' || args.action === 'key') {
    if (args.action === 'type' && !args.text) throw new LayerError('INVALID_ARGUMENT', 'canvas type needs text.');
    if (args.action === 'key' && !args.key) throw new LayerError('INVALID_ARGUMENT', 'canvas key needs key.');
    if (args.action === 'type' && CONSEQUENTIAL.test(args.text!)) throw new LayerError('USER_STEP', 'That text looks like a secret or a consequential step; the user types it themselves.');
    await assertCanvasFocused(ctx);
    if (args.action === 'type') {
      ctx.tab().actionSeq++;
      await (await ctx.attach()).cdp.send(undefined, 'Input.insertText', { text: args.text });
    } else await sendKey(ctx, args.key!);
    const typed: ActionReceipt = {
      action: `canvas ${args.action}`,
      target: `canvas ${quote(args.intent, 80)}: ${args.action === 'type' ? `${args.text!.length} characters` : args.key}`,
      mechanism: 'keyboard',
      dispatched: true,
      effect: { verdict: 'unattributable', signals: ['A canvas paints its own result; take a screenshot to see whether the input was taken.'] },
    };
    return withPageState(ctx, args.observe, { receipt: typed, data: {} });
  }
  if (!args.at) throw new LayerError('INVALID_ARGUMENT', `canvas ${args.action} needs at.`);
  if (args.action === 'drag' && !args.to) throw new LayerError('INVALID_ARGUMENT', 'A drag needs `to`, the place where it ends.');
  const viewport = await viewportOf(ctx);
  const at = { x: args.at[0] * viewport.width, y: args.at[1] * viewport.height };
  await assertCanvasAt(ctx, at.x, at.y);
  const tabsBefore = new Set((await ctx.controller.host.tabs.list().catch(() => [])).map(t => t.tabId));
  const end = args.to ? { x: args.to[0] * viewport.width, y: args.to[1] * viewport.height } : undefined;
  if (end) await assertCanvasAt(ctx, end.x, end.y);
  if (args.action === 'click') await rawClick(ctx, at.x, at.y, 'left', 1);
  else if (args.action === 'double_click') await rawClick(ctx, at.x, at.y, 'left', 2);
  else if (args.action === 'right_click') await rawClick(ctx, at.x, at.y, 'right', 1);
  else if (args.action === 'hover') await dispatchHover(ctx, at);
  else await dispatchDrag(ctx, at, end!);
  // A mis-aimed click on a painted button can open a store or help page. A tab that this action opened is the run's own and is closed at once,
  // so the run never wanders off to a site nobody asked for; the receipt says so.
  const stray: string[] = [];
  await new Promise(resolve => setTimeout(resolve, 350));
  for (const t of await ctx.controller.host.tabs.list().catch(() => [])) {
    if (tabsBefore.has(t.tabId)) continue;
    await ctx.controller.host.tabs.close(t.tabId).catch(() => undefined);
    ctx.session.forgetTab(t.tabId);
    stray.push(t.url);
  }
  const receipt: ActionReceipt = {
    action: `canvas ${args.action}`,
    target: `canvas ${quote(args.intent, 80)} at [${args.at!.map(n => n.toFixed(3)).join(', ')}]${args.to ? ` to [${args.to.map(n => n.toFixed(3)).join(', ')}]` : ''}`,
    mechanism: 'pointer',
    dispatched: true,
    effect: { verdict: 'unattributable', signals: stray.length ? [`The click opened another page (${stray[0].slice(0, 60)}), which was closed again: aim at the control you meant.`] : ['A canvas paints its own result; take a screenshot to see whether the action did what was meant.'] },
  };
  return withPageState(ctx, args.observe, { receipt, data: { point: at, ...(end ? { to: end } : {}) } });
}
