import { describe, expect, it } from 'vitest';
import { completedBrowserTools } from '../restore';
import type { Entry } from '@src/store/types';

const tool = (toolName: string, over: { result?: unknown; isError?: boolean } = {}): Entry =>
  ({
    type: 'message',
    id: `e-${toolName}-${Math.random()}`,
    at: new Date().toISOString(),
    meta: { runId: 'r1' },
    result: over.result,
    message: { role: 'tool', parts: [{ type: 'tool-result', toolCallId: 'c', toolName, text: 'x', isError: over.isError ?? false }] },
  }) as unknown as Entry;

describe('what counts as work done in a run', () => {
  it('counts layer results with a delivered receipt, as before', () => {
    expect(completedBrowserTools('r1', [tool('click', { result: { ok: true, receipt: { dispatched: true } } })])).toEqual(['click']);
    expect(completedBrowserTools('r1', [tool('click', { result: { ok: true, receipt: { dispatched: false } } })])).toEqual([]);
    expect(completedBrowserTools('r1', [tool('click', { result: { ok: false } })])).toEqual([]);
  });

  it('counts the agent tools that do page work, and nothing else without a receipt', () => {
    const branch = [tool('delegate'), tool('batch'), tool('start_parallel_tasks'), tool('parallel_task_status'), tool('read_attachment'), tool('plugin_search')];
    expect(completedBrowserTools('r1', branch)).toEqual(['delegate', 'batch', 'start_parallel_tasks', 'parallel_task_status']);
  });

  it('does not count a failed agent tool or another run', () => {
    expect(completedBrowserTools('r1', [tool('batch', { isError: true })])).toEqual([]);
    const other = { ...tool('delegate'), meta: { runId: 'r2' } } as unknown as Entry;
    expect(completedBrowserTools('r1', [other])).toEqual([]);
  });
});
