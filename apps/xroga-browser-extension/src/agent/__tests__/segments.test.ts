import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const find = (id: string) => ({ toolCalls: [{ name: 'find', input: { text: 'x' }, id }] });
const done = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'All done.' }, id: 'd' }] };

async function run(turnCap: number, replies: Array<{ toolCalls: Array<{ name: string; input: unknown; id: string }> }>, extendTurns?: () => Promise<number>) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Do a long job' }] } });
  const scripted = new ScriptedModel(replies);
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r1',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 'sys', tools: toolsForRun({ disabled: ['hover'], vision: false }),
    layer: new FakeLayer(), host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap, extendTurns,
  });
  return { end: await loop.run(), scripted };
}

describe('the end of a turn segment', () => {
  it('is not the end of the task: the next segment is asked for and the run continues to done', async () => {
    let asked = 0;
    const { end, scripted } = await run(2, [find('1'), find('2'), find('3'), find('4'), done], async () => { asked++; return 3; });
    expect(end.status).toBe('done');
    expect(end.outcome).toBe('success');
    expect(asked).toBe(1);
    expect(scripted.calls).toHaveLength(5);
  });

  it('asks again at the end of each further segment', async () => {
    let asked = 0;
    const { end } = await run(1, [find('1'), find('2'), find('3'), find('4'), done], async () => { asked++; return 1; });
    expect(end.status).toBe('done');
    expect(asked).toBe(4);
  });

  it('stops with the saved progress and an honest summary when the server refuses', async () => {
    const { end } = await run(2, [find('1'), find('2'), { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'Got partway.' }, id: 's' }] }], async () => 0);
    expect(end.status).toBe('capped');
    expect(end.outcome).toBe('partial');
  });

  it('behaves as before without an extension hook', async () => {
    const { end } = await run(2, [find('1'), find('2'), { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'x' }, id: 's' }] }]);
    expect(end.status).toBe('capped');
  });
});
