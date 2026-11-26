import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { MENU_PATH_TOOL, runMenuPath, validateMenuPath, type MenuStepResult } from '../menu-path';
import { FakeHost, FakeLayer, failed, ok } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const good: MenuStepResult = { ok: true, text: 'ok' };

describe('runMenuPath', () => {
  it('clicks each item in order and waits for the next to appear', async () => {
    const log: string[] = [];
    const r = await runMenuPath({ path: ['Tools', 'Scripts', 'Scripts Panel'], expect: 'JavaScript' }, async (tool, i) => {
      log.push(tool === 'click' ? `click:${(i.target as { name: string }).name}` : `wait:${String(i.text)}`);
      return good;
    });
    expect(r.ok).toBe(true);
    expect(log).toEqual(['click:Tools', 'wait:Scripts', 'click:Scripts', 'wait:Scripts Panel', 'click:Scripts Panel', 'wait:JavaScript']);
  });
  it('stops at the first item that does not appear and says which step and what was clicked so far', async () => {
    const r = await runMenuPath({ path: ['Tools', 'Scripts', 'Scripts Panel'] }, async (tool, i) => (tool === 'wait' && i.text === 'Scripts' ? { ok: false, text: 'TIMEOUT' } : good));
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe(1);
    expect(r.text).toContain('step 2 of 3');
    expect(r.text).toContain('Clicked so far: Tools');
  });
  it('tries other roles only on not-found, and reports any other failure as it is', async () => {
    const roles: string[] = [];
    const found = await runMenuPath({ path: ['Export'] }, async (tool, i) => { const role = (i.target as { role: string }).role; roles.push(role); return role === 'button' ? good : { ok: false, text: 'no match', errorCode: 'NO_MATCH' }; });
    expect(found.ok).toBe(true);
    expect(roles).toEqual(['menuitem', 'menuitemradio', 'menuitemcheckbox', 'button']);
    const covered: string[] = [];
    const blocked = await runMenuPath({ path: ['Export'] }, async (tool, i) => { covered.push((i.target as { role: string }).role); return { ok: false, text: 'covered by dialog', errorCode: 'OBSCURED' }; });
    expect(blocked.ok).toBe(false);
    expect(covered).toEqual(['menuitem']);
    expect(blocked.text).toContain('OBSCURED');
  });
  it('reports a wrong item when the expected text is not there at the end', async () => {
    const r = await runMenuPath({ path: ['File'], expect: 'Export' }, async (tool, i) => (tool === 'wait' ? { ok: false, text: 'TIMEOUT' } : good));
    expect(r.ok).toBe(false);
    expect(r.text).toContain('wrong item');
  });
  it('validates arguments', () => {
    expect(validateMenuPath({ path: ['A'] })).toBeNull();
    expect(validateMenuPath({ path: [] })).toContain('at least one');
    expect(validateMenuPath({ path: new Array(13).fill('x') })).toContain('12');
  });
});

describe('menu_path in a run', () => {
  it('is callable by the model and every click goes through the layer', async () => {
    const c = await createConversation({ mode: 'ask' });
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Open the scripts panel' }] } });
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'menu_path', id: 'm1', input: { path: ['Tools', 'Scripts'] } }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ]);
    const layer = new FakeLayer({ wait: () => ok('wait · met'), click: () => ({ ok: true, text: 'click · changed', receipt: { action: 'click', mechanism: 'pointer', dispatched: true, effect: { verdict: 'changed', signals: ['1 mutation'] } } as never }) });
    const loop = new AgentLoop({
      conversationId: c.id, runId: 'r',
      model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
      system: 's', tools: [...toolsForRun({ vision: true, pointAt: true }), MENU_PATH_TOOL], layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 4,
    });
    await loop.run();
    expect(layer.calls.filter(x => x.tool === 'click').map(x => (x.args.target as { name: string }).name)).toEqual(['Tools', 'Scripts']);
    expect(scripted.calls).toHaveLength(2);
    const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string }>;
    expect(results.find(r => r.toolName === 'menu_path')?.text).toContain('Opened Tools > Scripts');
  });
  it('reports a failed step to the model as an error', async () => {
    const c = await createConversation({ mode: 'ask' });
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Open it' }] } });
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'menu_path', id: 'm1', input: { path: ['Nope'] } }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'no' }, id: 'd' }] },
    ]);
    const layer = new FakeLayer({ click: () => failed('NO_MATCH', 'no match') });
    const loop = new AgentLoop({
      conversationId: c.id, runId: 'r',
      model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
      system: 's', tools: [...toolsForRun({ vision: true, pointAt: true }), MENU_PATH_TOOL], layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 4,
    });
    await loop.run();
    const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string; isError?: boolean }>;
    const r = results.find(x => x.toolName === 'menu_path')!;
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Stopped at step 1');
  });
});
