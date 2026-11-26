import { describe, expect, it, vi } from 'vitest';

vi.mock('../navigate', () => ({ withPageState: vi.fn(async (_ctx: unknown, _observe: unknown, outcome: unknown) => outcome) }));
vi.mock('../../interaction/pointer', () => ({ dispatchDrag: vi.fn(async () => ({ dispatched: true })), dispatchHover: vi.fn(async () => ({ dispatched: true })) }));

import { canvas, focusAcceptsPaintedInput } from '../canvas';
import { dispatchDrag } from '../../interaction/pointer';

function fakeCtx(nodeName: string, pending: Array<{ kind: string; detail: string }> = [], focus = 'CANVAS') {
  const sent: Array<{ method: string; params: Record<string, unknown> }> = [];
  const cdp = {
    send: vi.fn(async (_session: unknown, method: string, params: Record<string, unknown>) => {
      sent.push({ method, params });
      if (method === 'DOM.getNodeForLocation') return { backendNodeId: 7 };
      if (method === 'DOM.describeNode') return { node: { nodeName } };
      if (method === 'Runtime.evaluate') return { result: { value: focus === 'CANVAS' ? { tag: 'CANVAS', w: 900, h: 700, opacity: 1, offscreen: false, editable: false, bigCanvas: true } : focus === 'HIDDENTEXT' ? { tag: 'TEXTAREA', w: 1, h: 1, opacity: 0, offscreen: false, editable: false, bigCanvas: true } : { tag: focus, w: 200, h: 24, opacity: 1, offscreen: false, editable: false, bigCanvas: true } } };
      return {};
    }),
  };
  const hostTabs: Array<{ tabId: number; url: string }> = [{ tabId: 1, url: 'https://app.example/' }];
  const closed: number[] = [];
  const tab = { pending, actionSeq: 0, probe: { callGlobal: vi.fn(async () => ({ width: 1000, height: 500 })) } };
  const ctx = {
    attach: async () => ({ cdp, topology: { frames: async () => [{ frameId: 'main' }] } }),
    tab: () => tab,
    session: { forgetTab: vi.fn() },
    controller: { host: { tabs: { list: async () => [...hostTabs], close: async (id: number) => { closed.push(id); } } } },
    signal: undefined,
  };
  return { ctx: ctx as never, sent, tab, hostTabs, closed };
}

const base = { action: 'click' as const, at: [0.5, 0.4] as [number, number], intent: 'select the rectangle tool' };

describe('canvas pointer actions', () => {
  it('clicks at the fraction of the viewport when the point is on a canvas', async () => {
    const { ctx, sent } = fakeCtx('CANVAS');
    await canvas(ctx, base as never);
    const pressed = sent.find(s => s.method === 'Input.dispatchMouseEvent' && s.params.type === 'mousePressed');
    expect(pressed?.params).toMatchObject({ x: 500, y: 200, button: 'left', clickCount: 1 });
    expect(sent.some(s => s.params.type === 'mouseReleased')).toBe(true);
  });

  it('refuses a point on a real page element and sends no mouse event, so guarded controls stay guarded', async () => {
    const { ctx, sent } = fakeCtx('BUTTON');
    await expect(canvas(ctx, base as never)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(sent.some(s => s.method === 'Input.dispatchMouseEvent')).toBe(false);
  });

  it('refuses an intent that names a consequential step', async () => {
    const { ctx, sent } = fakeCtx('CANVAS');
    await expect(canvas(ctx, { ...base, intent: 'click Pay now' } as never)).rejects.toMatchObject({ code: 'USER_STEP' });
    await expect(canvas(ctx, { ...base, intent: 'delete the layer' } as never)).rejects.toMatchObject({ code: 'USER_STEP' });
    expect(sent).toHaveLength(0);
  });

  it('stops while a dialog is open, and needs an end point for a drag', async () => {
    const { ctx } = fakeCtx('CANVAS', [{ kind: 'dialog', detail: 'a prompt' }]);
    await expect(canvas(ctx, base as never)).rejects.toMatchObject({ code: 'MODAL_PENDING' });
    const second = fakeCtx('CANVAS');
    await expect(canvas(second.ctx, { ...base, action: 'drag' } as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('drags between two canvas points in page pixels', async () => {
    const { ctx } = fakeCtx('CANVAS');
    await canvas(ctx, { ...base, action: 'drag', to: [0.8, 0.9] } as never);
    expect(dispatchDrag).toHaveBeenCalledWith(expect.anything(), { x: 500, y: 200 }, { x: 800, y: 450 });
  });

  it('types into a canvas-painted field only while a canvas has focus, with insertText', async () => {
    const { ctx, sent } = fakeCtx('CANVAS', [], 'CANVAS');
    await canvas(ctx, { action: 'type', text: '#0000FF', intent: 'set the fill colour' } as never);
    expect(sent.find(s => s.method === 'Input.insertText')?.params).toEqual({ text: '#0000FF' });
    const real = fakeCtx('CANVAS', [], 'INPUT');
    await expect(canvas(real.ctx, { action: 'type', text: 'x', intent: 'type into a field' } as never)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(real.sent.some(s => s.method === 'Input.insertText')).toBe(false);
  });

  it('presses named keys and chords with the right modifiers, and refuses unknown keys', async () => {
    const { ctx, sent } = fakeCtx('CANVAS');
    await canvas(ctx, { action: 'key', key: 'Control+A', intent: 'select all' } as never);
    const down = sent.find(s => s.method === 'Input.dispatchKeyEvent');
    expect(down?.params).toMatchObject({ modifiers: 2, key: 'a', code: 'KeyA' });
    await canvas(ctx, { action: 'key', key: 'Enter', intent: 'confirm the dialog' } as never);
    expect(sent.filter(s => s.method === 'Input.dispatchKeyEvent').some(s => s.params.type === 'keyDown' && s.params.key === 'Enter' && typeof s.params.text === 'string' && s.params.text.length === 1)).toBe(true);
    await expect(canvas(ctx, { action: 'key', key: 'Hyper+Q', intent: 'x' } as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('never types a secret into a canvas', async () => {
    const { ctx, sent } = fakeCtx('CANVAS');
    await expect(canvas(ctx, { action: 'type', text: 'my password is hunter2', intent: 'fill the dialog' } as never)).rejects.toMatchObject({ code: 'USER_STEP' });
    await expect(canvas(ctx, { action: 'type', text: 'abc', intent: 'enter the password' } as never)).rejects.toMatchObject({ code: 'USER_STEP' });
    expect(sent.some(s => s.method === 'Input.insertText')).toBe(false);
  });

  it('closes a page that the click opened, so the run does not wander to another site', async () => {
    const { ctx, hostTabs, closed } = fakeCtx('CANVAS');
    const original = hostTabs.slice();
    let calls = 0;
    (ctx as { controller: { host: { tabs: { list: () => Promise<unknown[]> } } } }).controller.host.tabs.list = async () => (++calls === 1 ? original : [...original, { tabId: 9, url: 'https://apps.microsoft.com/store' }]);
    const out = await canvas(ctx, base as never) as { receipt?: { effect: { signals: string[] } } };
    expect(closed).toEqual([9]);
    expect(JSON.stringify(out)).toMatch(/closed again/);
  });

  it('accepts a hidden text box that a painted editor keeps focused, and nothing a user can see or a password field', async () => {
    const { ctx, sent } = fakeCtx('CANVAS', [], 'HIDDENTEXT');
    await canvas(ctx, { action: 'type', text: 'ActiveLayer.CreateRectangle(1,1,2,2)', intent: 'enter the script' } as never);
    expect(sent.some(s => s.method === 'Input.insertText')).toBe(true);
    const base = { w: 1, h: 1, opacity: 0, offscreen: false, editable: false, bigCanvas: true };
    expect(focusAcceptsPaintedInput({ ...base, tag: 'INPUT', type: 'password' })).toBe(false);
    expect(focusAcceptsPaintedInput({ ...base, tag: 'INPUT', w: 300, h: 30, opacity: 1 })).toBe(false);
    expect(focusAcceptsPaintedInput({ ...base, tag: 'TEXTAREA', bigCanvas: false })).toBe(false);
    expect(focusAcceptsPaintedInput({ ...base, tag: 'BUTTON' })).toBe(false);
  });

  it('replace selects all before inserting, so the text does not splice into the example', async () => {
    const { ctx, sent } = fakeCtx('CANVAS', [], 'HIDDENTEXT');
    await canvas(ctx, { action: 'type', text: 'print(1)', replace: true, intent: 'enter the script' } as never);
    const order = sent.map(s => s.method === 'Input.dispatchKeyEvent' ? `key:${s.params.key}:${s.params.modifiers}` : s.method).filter(m => m.startsWith('key:') || m === 'Input.insertText');
    expect(order.indexOf('key:a:2')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('key:a:2')).toBeLessThan(order.indexOf('Input.insertText'));
  });
  it('lets a key press reach the document on a big-canvas page (timeline shortcuts), but never typed text, and not without a big canvas', () => {
    const body = { tag: 'BODY', w: 1000, h: 800, opacity: 1, offscreen: false, editable: false, bigCanvas: true };
    expect(focusAcceptsPaintedInput(body, 'key')).toBe(true);
    expect(focusAcceptsPaintedInput(body, 'type')).toBe(false);
    expect(focusAcceptsPaintedInput(body)).toBe(false);
    expect(focusAcceptsPaintedInput({ ...body, bigCanvas: false }, 'key')).toBe(false);
    expect(focusAcceptsPaintedInput({ ...body, tag: 'INPUT', w: 300, h: 30 }, 'key')).toBe(false);
  });
});
