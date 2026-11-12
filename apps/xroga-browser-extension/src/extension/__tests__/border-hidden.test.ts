import { describe, expect, it } from 'vitest';
import { PageBorder } from '../border';
import type { BorderState } from '../border';

/** One working conversation with tab 1; `visible` is what the port reports, and can change. */
function setup(visible: { value: boolean }) {
  const sent: Array<[number, BorderState]> = [];
  const border = new PageBorder({
    conversationOf: async () => 'a',
    tabsOf: async () => [1],
    scopedTabs: async () => [1],
    enabled: async () => true,
    visible: async () => visible.value,
    inject: async (tabId, state) => {
      sent.push([tabId, state]);
    },
  });
  return { border, sent };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

describe('PageBorder and hidden tabs', () => {
  it('draws nothing into a hidden tab, and draws it when the tab becomes visible', async () => {
    const visible = { value: false };
    const { border, sent } = setup(visible);
    await border.status('a', 'running');
    await border.point(1, { x: 10, y: 20 }, 'click');
    await settle();
    expect(sent).toEqual([]);
    visible.value = true;
    await border.shown(1);
    await settle();
    expect(sent).toEqual([[1, 'on']]);
  });

  it('draws at once into a visible tab, as before', async () => {
    const { border, sent } = setup({ value: true });
    await border.status('a', 'running');
    await settle();
    expect(sent).toEqual([[1, 'on']]);
  });

  it('removes the overlay even while a hidden-tab check is pending, and never lets an old draw land after it', async () => {
    const visible = { value: true };
    const sent: Array<[number, BorderState]> = [];
    let release: (v: boolean) => void = () => undefined;
    const border = new PageBorder({
      conversationOf: async () => 'a',
      tabsOf: async () => [1],
      scopedTabs: async () => [1],
      enabled: async () => true,
      visible: () => new Promise<boolean>(resolve => (release = resolve)),
      inject: async (tabId, state) => {
        sent.push([tabId, state]);
      },
    });
    void visible;
    await border.status('a', 'running'); // an 'on' waits for the visibility answer
    await border.status('a', 'done'); // the run ended: 'off' goes out at once
    release(true);
    await settle();
    expect(sent).toEqual([[1, 'off']]);
  });
});
