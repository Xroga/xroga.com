import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamTurn } from '@src/llm';

const requests: Array<{ op: string; value: unknown }> = [];
let turnFails: unknown;
vi.mock('../bridge', () => ({
  workspaceRequest: vi.fn(async (op: string, value: unknown) => {
    requests.push({ op, value });
    if (op === 'start') return { runId: '11111111-1111-4111-8111-111111111111', turns: 0, maxTurns: 48, remainingMs: 2_400_000 };
    if (op === 'extend') return { maxTurns: 96, remainingMs: 4_800_000 };
    if (op === 'turn') {
      if (turnFails) throw turnFails;
      return { id: 'x', model: 'm', choice: { finish_reason: 'stop', message: { content: 'ok' } }, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    }
    return {};
  }),
}));

import { startXrogaModelRun } from '../model';

beforeEach(() => {
  requests.length = 0;
  turnFails = undefined;
});

describe('a canonical run', () => {
  it('asks the server for its next segment and reports the turns and time granted; there is no client-side ceiling', async () => {
    const run = await startXrogaModelRun('goal', 'https://example.com', new AbortController().signal, 0);
    expect(run.remainingTurns).toBe(48);
    expect(await run.extend()).toEqual({ turns: 48, remainingMs: 4_800_000 });
    // The server's own answer is not second-guessed by a fixed ceiling in the extension.
    expect(requests.some(r => r.op === 'extend')).toBe(true);
  });

  it('keeps going to very large allowances the server may one day grant', async () => {
    const bridge = await import('../bridge');
    (bridge.workspaceRequest as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ runId: '11111111-1111-4111-8111-111111111111', turns: 100, maxTurns: 5_000, remainingMs: 90 * 3_600_000 }));
    const run = await startXrogaModelRun('goal', 'https://example.com', new AbortController().signal, 0, '11111111-1111-4111-8111-111111111111');
    expect(run.remainingTurns).toBe(4_900);
    expect(run.remainingMs).toBe(90 * 3_600_000);
  });

  it('treats a refused entitlement as a clean, resumable stop: not an unverified request', async () => {
    const run = await startXrogaModelRun('goal', 'https://example.com', new AbortController().signal, 0);
    turnFails = Object.assign(new Error('x'), { code: 'BROWSER_ALLOWANCE_EXHAUSTED' });
    const reply = await streamTurn({ chat: run.model.chat, system: 's', messages: [{ role: 'user', content: 'hi' }], tools: {}, signal: new AbortController().signal } as never);
    expect(reply.error).toBeTruthy();
    expect(run.allowanceExhausted).toBe(true);
    expect(run.requestInterrupted).toBe(false);
  });

  it('treats a request over the server size cap as an overflow to compact, not as an unverified request, and gives the turn back', async () => {
    const run = await startXrogaModelRun('goal', 'https://example.com', new AbortController().signal, 0);
    turnFails = Object.assign(new Error('x'), { code: 'BROWSER_CONTEXT_TOO_LARGE' });
    const reply = await streamTurn({ chat: run.model.chat, system: 's', messages: [{ role: 'user', content: 'hi' }], tools: {}, signal: new AbortController().signal } as never);
    expect(reply.error).toBeTruthy();
    expect(run.requestInterrupted).toBe(false);
    // The next request after compaction reuses the same turn number: the server never counted the refused one.
    turnFails = undefined;
    await streamTurn({ chat: run.model.chat, system: 's', messages: [{ role: 'user', content: 'hi' }], tools: {}, signal: new AbortController().signal } as never);
    const turns = requests.filter(r => r.op === 'turn').map(r => (r.value as { body: { turn: number } }).body.turn);
    expect(turns).toEqual([1, 1]);
  });

  it('still treats any other failed model request as unverified and never retries it', async () => {
    const run = await startXrogaModelRun('goal', 'https://example.com', new AbortController().signal, 0);
    turnFails = new Error('network');
    await streamTurn({ chat: run.model.chat, system: 's', messages: [{ role: 'user', content: 'hi' }], tools: {}, signal: new AbortController().signal } as never);
    expect(run.requestInterrupted).toBe(true);
    expect(run.allowanceExhausted).toBe(false);
    expect(requests.filter(r => r.op === 'turn')).toHaveLength(1);
  });
});
