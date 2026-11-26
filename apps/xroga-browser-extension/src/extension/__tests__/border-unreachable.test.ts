import { describe, expect, it } from 'vitest';
import { PageBorder } from '../border';

function setup(injectFails: (tabId: number) => boolean) {
  const marks: Array<[number, boolean]> = [];
  const border = new PageBorder({
    conversationOf: async () => 'a',
    tabsOf: async () => [1, 2],
    scopedTabs: async () => [1, 2],
    enabled: async () => true,
    inject: async tabId => {
      if (injectFails(tabId)) throw new Error('Cannot access a chrome:// URL');
    },
    unreachable: async (tabId, working) => {
      marks.push([tabId, working]);
    },
  });
  return { border, marks };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('a page that cannot show the overlay', () => {
  it('is marked on the toolbar button while the task works there, and the others are left alone', async () => {
    const { border, marks } = setup(tabId => tabId === 1);
    await border.status('a', 'running');
    await settle();
    expect(marks).toContainEqual([1, true]);
    expect(marks).toContainEqual([2, false]);
    expect(marks).not.toContainEqual([2, true]);
  });

  it('is cleared when the run stops working', async () => {
    const { border, marks } = setup(() => true);
    await border.status('a', 'running');
    await settle();
    marks.length = 0;
    await border.status('a', 'done');
    await settle();
    expect(marks).toContainEqual([1, false]);
    expect(marks).toContainEqual([2, false]);
  });
});
