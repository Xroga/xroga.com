import { describe, expect, it, vi } from 'vitest';

const live: string[] = [];
let peak = 0;
vi.mock('../bridge', () => ({
  workspaceRequest: vi.fn(async (op: string) => {
    live.push(op);
    peak = Math.max(peak, live.length);
    await new Promise(resolve => setTimeout(resolve, 20));
    live.pop();
    return { tools: [{ slug: 'X_LIST', toolkit: 'x', description: 'd', parameters: {} }], apps: [], plan: undefined, pitfalls: undefined, guidance: undefined };
  }),
}));

import { runPluginTool } from '../plugins';

describe('connected-app calls from one run', () => {
  it('run one at a time even when the agent asks for several together, so none is refused for overlapping', async () => {
    const signal = new AbortController().signal;
    const wrap = (text: string) => text;
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => runPluginTool('plugin_search', 'run-1', { query: `app ${i}` }, signal, async () => 'approve', wrap)),
    );
    expect(results.every(result => !result.isError)).toBe(true);
    expect(peak).toBe(1);
  });
});
