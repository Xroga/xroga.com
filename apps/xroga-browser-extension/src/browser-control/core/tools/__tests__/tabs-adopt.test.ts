import { describe, expect, it, vi } from 'vitest';
import { tabs } from '../tabs';
import { BATCH_TOOLS } from '../../../../agent/batch-plan';

type T = { tabId: number; windowId: number; url: string; title: string; active: boolean; status: 'complete' };
const tab = (tabId: number, windowId: number, url: string, title: string): T => ({ tabId, windowId, url, title, active: false, status: 'complete' });

function fakeCtx(all: T[], inSession: number[], activeTabId: number) {
  const session = {
    activeTabId,
    tabIds: () => inSession,
    hasTab: (id: number) => inSession.includes(id),
    shareTab: vi.fn((id: number) => { inSession.push(id); }),
    setActive: vi.fn(),
    shouldReveal: vi.fn(async () => true),
    forgetTab: vi.fn(),
  };
  const host = { tabs: { get: async (id: number) => all.find(t => t.tabId === id) ?? null, list: async () => all, activate: vi.fn(async () => undefined) } };
  return { ctx: { session, controller: { host } } as never, session, host };
}

const mine = tab(1, 10, 'https://www.google.com/', 'Google');
const editor = tab(2, 10, 'https://tracedraw.github.io/tracedraw/', 'TraceDraw - Welcome Screen');
const otherWindow = tab(3, 20, 'https://tracedraw.github.io/other', 'TraceDraw other window');
const bank = tab(4, 10, 'https://bank.example.com/accounts', 'My Bank');

describe('tabs adopt: use a tab the user already has open', () => {
  it('shares the one matching tab of the same window and makes it active', async () => {
    const { ctx, session, host } = fakeCtx([mine, editor, otherWindow, bank], [1], 1);
    await tabs(ctx, { intent: 'use the open editor', action: 'adopt', url: 'tracedraw' } as never);
    expect(session.shareTab).toHaveBeenCalledWith(2, 'shared');
    expect(host.tabs.activate).toHaveBeenCalledWith(2);
  });

  it('never considers a tab of another window, and never names a tab that does not match', async () => {
    const { ctx, session } = fakeCtx([mine, otherWindow, bank], [1], 1);
    await expect(tabs(ctx, { intent: 'x', action: 'adopt', url: 'tracedraw' } as never)).rejects.toMatchObject({ code: 'NO_MATCH' });
    expect(session.shareTab).not.toHaveBeenCalled();
    try {
      await tabs(ctx, { intent: 'x', action: 'adopt', url: 'tracedraw' } as never);
    } catch (error) {
      expect(String((error as Error).message)).not.toMatch(/bank/i);
    }
  });

  it('asks for a more specific match when several tabs fit, naming only those', async () => {
    const second = tab(5, 10, 'https://tracedraw.github.io/docs', 'TraceDraw docs');
    const { ctx, session } = fakeCtx([mine, editor, second, bank], [1], 1);
    const error = await tabs(ctx, { intent: 'x', action: 'adopt', url: 'tracedraw' } as never).catch(e => e);
    expect(error).toMatchObject({ code: 'AMBIGUOUS_TARGET' });
    expect(String(error.message)).toMatch(/tab 2/);
    expect(String(error.message)).not.toMatch(/bank/i);
    expect(session.shareTab).not.toHaveBeenCalled();
  });

  it('refuses a very short match, and does not adopt a non-web page', async () => {
    const { ctx } = fakeCtx([mine, tab(6, 10, 'chrome://extensions/', 'Extensions')], [1], 1);
    await expect(tabs(ctx, { intent: 'x', action: 'adopt', url: 'ab' } as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(tabs(ctx, { intent: 'x', action: 'adopt', url: 'extensions' } as never)).rejects.toMatchObject({ code: 'NO_MATCH' });
  });
});

describe('batch plans', () => {
  it('may contain canvas steps, so a known sequence on a canvas takes one model turn', () => {
    expect(BATCH_TOOLS.has('canvas')).toBe(true);
  });
});
