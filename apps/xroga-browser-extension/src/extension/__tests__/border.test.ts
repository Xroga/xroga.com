import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@src/browser-control';
import { HIDE_WAIT_MS, NEUTRAL_LABEL, PageBorder, toolLabel } from '../border';
import type { BorderState, PointerCommand } from '../border';
import { screenshotTab } from '../agent-session';

/** Two conversations: a with tabs 1 and 2, b with tab 3. */
function setup(options: { enabled?: boolean; hide?: () => Promise<void> } = {}) {
  const sent: Array<[number, BorderState, string?]> = [];
  const pointers: Array<[number, BorderState, PointerCommand | undefined]> = [];
  const owner: Record<number, string> = { 1: 'a', 2: 'a', 3: 'b' };
  let enabled = options.enabled ?? true;
  const border = new PageBorder({
    conversationOf: async tabId => owner[tabId] ?? null,
    tabsOf: async c =>
      Object.keys(owner)
        .map(Number)
        .filter(t => owner[t] === c),
    scopedTabs: async () => Object.keys(owner).map(Number),
    enabled: async () => enabled,
    inject: async (tabId, state, documentId, pointer) => {
      sent.push(documentId ? [tabId, state, documentId] : [tabId, state]);
      pointers.push([tabId, state, pointer]);
      if (state === 'hidden' && options.hide) await options.hide();
    },
  });
  return { border, sent, pointers, owner, setEnabled: (on: boolean) => (enabled = on) };
}

afterEach(() => vi.useRealTimers());

describe('PageBorder', () => {
  it('draws the border on every tab of a working run, and removes it when the run stops working', async () => {
    const { border, sent } = setup();
    await border.status('a', 'running');
    expect(sent).toEqual([
      [1, 'on'],
      [2, 'on'],
    ]);
    sent.length = 0;
    await border.status('a', 'awaiting_user');
    expect(sent).toEqual([
      [1, 'off'],
      [2, 'off'],
    ]);
  });

  it('draws nothing while the setting is off, and follows the setting when it changes', async () => {
    const { border, sent, setEnabled } = setup({ enabled: false });
    await border.status('a', 'running');
    expect(sent.every(([, s]) => s === 'off')).toBe(true);
    sent.length = 0;
    setEnabled(true);
    await border.settingChanged();
    expect(sent).toEqual([
      [1, 'on'],
      [2, 'on'],
      [3, 'off'],
    ]);
  });

  it('a tab that joins a working run gets the border; a tab that leaves loses it', async () => {
    const { border, sent, owner } = setup();
    await border.status('a', 'running');
    sent.length = 0;
    owner[4] = 'a';
    await border.tabsChanged([4], [2]);
    expect(sent).toEqual([
      [4, 'on'],
      [2, 'off'],
    ]);
  });

  it('a new document of a working tab gets the border; other tabs are left alone', async () => {
    const { border, sent } = setup();
    await border.status('a', 'running');
    sent.length = 0;
    await border.committed(1, 'doc-1');
    await border.committed(3, 'doc-3');
    expect(sent).toEqual([[1, 'on', 'doc-1']]);
  });

  it('turns every scoped tab off at worker start', async () => {
    const { border, sent } = setup();
    await border.start();
    expect(sent).toEqual([
      [1, 'off'],
      [2, 'off'],
      [3, 'off'],
    ]);
  });

  it('fades the border out for a screenshot and brings it back after', async () => {
    const { border, sent } = setup();
    await border.status('a', 'running');
    sent.length = 0;
    const order: string[] = [];
    const result = await border.around(1, async () => {
      order.push(`capture after ${sent.map(([t, s]) => `${t}:${s}`).join(',')}`);
      return 'image';
    });
    // Showing it again is not waited for.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result).toBe('image');
    expect(order).toEqual(['capture after 1:hidden']);
    expect(sent).toEqual([
      [1, 'hidden'],
      [1, 'on'],
    ]);
  });

  it('a screenshot of a tab with no border is captured at once', async () => {
    const { border, sent } = setup();
    expect(await border.around(1, async () => 'image')).toBe('image');
    expect(sent).toEqual([]);
  });

  it('captures anyway when the border does not hide in time', async () => {
    vi.useFakeTimers();
    const { border } = setup({ hide: () => new Promise(() => undefined) });
    await border.status('a', 'running');
    let captured = false;
    const done = border.around(1, async () => (captured = true));
    await vi.advanceTimersByTimeAsync(HIDE_WAIT_MS - 10);
    expect(captured).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    await done;
    expect(captured).toBe(true);
  });

  it('screenshots of one tab that overlap share one fade', async () => {
    let fade!: () => void;
    const { border, sent } = setup({ hide: () => new Promise<void>(resolve => (fade = resolve)) });
    await border.status('a', 'running');
    sent.length = 0;
    const captured: string[] = [];
    const first = border.around(1, async () => captured.push('first'));
    const second = border.around(1, async () => captured.push('second'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sent).toEqual([[1, 'hidden']]);
    expect(captured).toEqual([]);
    fade();
    await Promise.all([first, second]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(captured).toEqual(['first', 'second']);
    expect(sent).toEqual([
      [1, 'hidden'],
      [1, 'on'],
    ]);
  });

  it('a document that commits during a screenshot gets the border hidden', async () => {
    const { border, sent } = setup();
    await border.status('a', 'running');
    sent.length = 0;
    await border.around(1, async () => {
      await border.committed(1, 'doc-2');
    });
    expect(sent.slice(0, 2)).toEqual([
      [1, 'hidden'],
      [1, 'hidden', 'doc-2'],
    ]);
  });
});

describe('the agent pointer', () => {
  const last = (pointers: Array<[number, BorderState, PointerCommand | undefined]>, tabId: number) =>
    [...pointers].reverse().find(([t]) => t === tabId);

  it('shows a neutral anchored status as soon as a run starts working, with no invented coordinates', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    expect(pointers.filter(([, state]) => state === 'on').every(([, , p]) => p?.label === NEUTRAL_LABEL && p.x === undefined)).toBe(true);
  });

  it('moves to the last verified action point and stays there while the model waits', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.point(1, { x: 120, y: 80 }, 'click');
    await border.activity('a', 'Waiting for response');
    // The wait repaints the status at the same verified point: the pointer does not vanish and does not jump.
    expect(last(pointers, 1)).toEqual([1, 'on', { x: 120, y: 80, kind: 'click', label: 'Waiting for response' }]);
  });

  it('does not repaint when the status has not changed', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.activity('a', 'Analyzing page');
    const count = pointers.length;
    await border.activity('a', 'Analyzing page');
    expect(pointers.length).toBe(count);
  });

  it('shows the status of the action when no model status is set', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.point(1, { x: 10, y: 20 }, 'type');
    expect(last(pointers, 1)?.[2]).toEqual({ x: 10, y: 20, kind: 'type', label: 'Typing' });
  });

  it('a page or tab opening anchors the pointer neutrally instead of pointing at a control', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.point(1, { x: 50, y: 50 }, 'click');
    await border.point(1, { x: 0, y: 0 }, 'navigation');
    expect(last(pointers, 1)?.[2]).toEqual({ label: 'Page opened' });
  });

  it('drops the old coordinates when a new document commits, and shows the neutral status there', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.point(1, { x: 300, y: 200 }, 'click');
    await border.committed(1, 'doc-2');
    expect(last(pointers, 1)).toEqual([1, 'on', { label: NEUTRAL_LABEL }]);
    // A later status keeps the neutral anchor, not the stale point.
    await border.activity('a', 'Waiting for response');
    expect(last(pointers, 1)?.[2]).toEqual({ label: 'Waiting for response' });
  });

  it('comes straight back after a screenshot, at the same point and status', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.point(1, { x: 64, y: 32 }, 'click');
    await border.activity('a', 'Capturing the page');
    await border.around(1, async () => 'image');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(last(pointers, 1)).toEqual([1, 'on', { x: 64, y: 32, kind: 'click', label: 'Capturing the page' }]);
  });

  it('is not painted in other conversations or in a run that has stopped', async () => {
    const { border, pointers, sent } = setup();
    await border.status('a', 'running');
    pointers.length = 0;
    await border.point(3, { x: 5, y: 5 }, 'click');
    await border.activity('b', 'Typing');
    expect(pointers).toEqual([]);
    await border.status('a', 'done');
    expect(last(pointers, 1)?.[1]).toBe('off');
    expect(sent.filter(([t, s]) => t === 3 && s !== 'off')).toEqual([]);
  });

  it('forgets the point, and the status, when the run stops, so a new run starts neutral', async () => {
    const { border, pointers } = setup();
    await border.status('a', 'running');
    await border.point(1, { x: 70, y: 90 }, 'click');
    await border.activity('a', 'Typing');
    await border.status('a', 'stopped');
    pointers.length = 0;
    await border.status('a', 'running');
    expect(last(pointers, 1)?.[2]).toEqual({ label: NEUTRAL_LABEL });
  });

  it('draws nothing and does not accept a point while the setting is off', async () => {
    const { border, pointers } = setup({ enabled: false });
    await border.status('a', 'running');
    pointers.length = 0;
    await border.point(1, { x: 1, y: 1 }, 'click');
    await border.activity('a', 'Typing');
    expect(pointers).toEqual([]);
  });

  it('removes the pointer from a tab that leaves the run', async () => {
    const { border, pointers, owner } = setup();
    await border.status('a', 'running');
    await border.point(2, { x: 9, y: 9 }, 'click');
    delete owner[2];
    await border.tabsChanged([], [2]);
    expect(last(pointers, 2)?.[1]).toBe('off');
  });

  it('shows a status for each real tool, never an invented one', () => {
    expect(toolLabel('click')).toBe('Clicking');
    expect(toolLabel('fill')).toBe('Typing');
    expect(toolLabel('scroll')).toBe('Scrolling');
    expect(toolLabel('navigate')).toBe('Opening page');
    expect(toolLabel('tabs')).toBe('Switching tabs');
    expect(toolLabel('screenshot')).toBe('Capturing the page');
    expect(toolLabel('ask_user')).toBe('Waiting for you');
    expect(toolLabel('something_new')).toBe('Working');
  });
});

describe('screenshotTab', () => {
  const session = (refs: Record<string, number>, active: number | null) =>
    ({
      activeTabId: active,
      controller: { registry: { get: (ref: string) => (ref in refs ? { tabId: refs[ref] } : undefined) } },
    }) as unknown as Session;

  it('is the ref’s tab first, then tabId, then the active tab', () => {
    expect(screenshotTab(session({ e5: 7 }, 1), { ref: 'e5', tabId: 9 })).toBe(7);
    expect(screenshotTab(session({}, 1), { tabId: 9 })).toBe(9);
    expect(screenshotTab(session({}, 1), {})).toBe(1);
  });

  it('is null for a ref the session does not know', () => {
    expect(screenshotTab(session({}, 1), { ref: 'e9' })).toBe(null);
  });
});
