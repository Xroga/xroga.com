import { describe, expect, it, vi } from 'vitest';

vi.mock('../navigate', () => ({ withPageState: vi.fn(async (_ctx: unknown, _observe: unknown, outcome: unknown) => outcome) }));
vi.mock('../../interaction/pointer', () => ({ dispatchDrag: vi.fn(async () => ({ dispatched: true })), dispatchHover: vi.fn(async () => ({ dispatched: true })) }));
vi.mock('../../interaction/evidence', () => ({ checkExpectation: vi.fn() }));

import { canvas } from '../canvas';
import { checkExpectation } from '../../interaction/evidence';

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

const base = { action: 'click' as const, at: [0.5, 0.4] as [number, number], intent: 'open the Tools menu', expect: { text: 'Scripts' } };
type Out = { receipt?: { postcondition?: { status: string; detail?: string }; effect: { signals: string[] } } };

describe('canvas expect', () => {
  it('reports an unmet expectation with a hint, so a wrong menu is not taken for a success', async () => {
    vi.mocked(checkExpectation).mockReset().mockResolvedValue({ status: 'unmet', detail: '"Scripts" is not on the page' } as never);
    const { ctx } = fakeCtx('CANVAS');
    const out = (await canvas(ctx, base as never)) as Out;
    expect(out.receipt?.postcondition?.status).toBe('unmet');
    expect(out.receipt?.effect.signals.join(' ')).toContain('Expected state not reached');
    expect(out.receipt?.effect.signals.join(' ')).toContain('another control or menu');
  }, 15_000);
  it('waits briefly for a menu that opens a moment later', async () => {
    vi.mocked(checkExpectation).mockReset()
      .mockResolvedValueOnce({ status: 'unmet', detail: 'x' } as never)
      .mockResolvedValueOnce({ status: 'unmet', detail: 'x' } as never)
      .mockResolvedValue({ status: 'met' } as never);
    const { ctx } = fakeCtx('CANVAS');
    const out = (await canvas(ctx, base as never)) as Out;
    expect(out.receipt?.postcondition?.status).toBe('met');
    expect(vi.mocked(checkExpectation).mock.calls.length).toBe(3);
  }, 15_000);
  it('checks keyboard actions too, and does nothing extra without expect', async () => {
    vi.mocked(checkExpectation).mockReset().mockResolvedValue({ status: 'met' } as never);
    const { ctx } = fakeCtx('HIDDENTEXT', [], 'HIDDENTEXT');
    const keyed = (await canvas(ctx, { action: 'key', key: 'Control+E', intent: 'open export', expect: { text: 'Export' } } as never)) as Out;
    expect(keyed.receipt?.postcondition?.status).toBe('met');
    vi.mocked(checkExpectation).mockClear();
    const { ctx: ctx2 } = fakeCtx('CANVAS');
    const plain = (await canvas(ctx2, { action: 'click', at: [0.5, 0.4], intent: 'select the rectangle tool' } as never)) as Out;
    expect(plain.receipt?.postcondition).toBeUndefined();
    expect(checkExpectation).not.toHaveBeenCalled();
  }, 15_000);
});
