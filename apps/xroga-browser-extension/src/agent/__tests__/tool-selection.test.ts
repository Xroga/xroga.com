import { describe, expect, it } from 'vitest';
import { isReadOnlyRequest, startingTools } from '../tool-selection';
import { toolsForRun } from '../tools';

describe('isReadOnlyRequest', () => {
  it('treats the recorded requests as read-only, including what the user forbids', () => {
    expect(isReadOnlyRequest('Go to xroga.com and tell me the page heading and the URL. Do not click or type anything.')).toBe(true);
    expect(
      isReadOnlyRequest('Open https://stackendbox.com in a new tab, read the page heading, and tell me the heading and URL. Do not click or type anything.'),
    ).toBe(true);
  });

  it('keeps every tool when the request asks for an action or is unclear', () => {
    expect(isReadOnlyRequest('Go to example.com and click the first link, then tell me the heading')).toBe(false);
    expect(isReadOnlyRequest('Search for cheap flights to Lisbon and tell me the price')).toBe(false);
    expect(isReadOnlyRequest('Fill in the contact form on example.com')).toBe(false);
    expect(isReadOnlyRequest('Log in and tell me my balance')).toBe(false);
    expect(isReadOnlyRequest('Do something useful with this page')).toBe(false);
    expect(isReadOnlyRequest('Open the catalog and report the published fixture price.')).toBe(false);
  });
});

describe('startingTools', () => {
  const full = toolsForRun({ vision: false });
  const names = (tools: { name: string }[]) => tools.map(t => t.name);

  it('starts a read-only request without the action tools and offers enable_actions', () => {
    const { tools, full: switchTo } = startingTools(full, 'Go to xroga.com and tell me the page heading and the URL.');
    expect(names(tools)).toEqual(expect.arrayContaining(['snapshot', 'read', 'navigate', 'tabs', 'done', 'enable_actions']));
    for (const gone of ['click', 'type', 'fill_form', 'scroll', 'upload']) expect(names(tools)).not.toContain(gone);
    expect(switchTo).toBe(full);
    const chars = (list: typeof tools) => JSON.stringify(list.map(t => [t.name, t.description, t.parameters])).length;
    expect(chars(tools)).toBeLessThan(chars(full) / 2);
  });

  it('keeps the full list for an interactive request', () => {
    const { tools, full: switchTo } = startingTools(full, 'Add the first laptop to the cart');
    expect(tools).toBe(full);
    expect(switchTo).toBeUndefined();
  });
});
