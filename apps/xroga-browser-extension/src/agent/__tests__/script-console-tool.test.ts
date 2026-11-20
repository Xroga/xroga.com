import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { SCRIPT_CONSOLE_TOOL } from '../command-surface-adapter';
import { FakeHost, FakeLayer, failed, ok } from '../testing/fake-layer';
import type { Result } from '@src/browser-control';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const receipt = (action: string): Result['receipt'] => ({ action, mechanism: 'pointer', dispatched: true, effect: { verdict: 'changed', signals: ['1 mutation'] } });
const done = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'Finished.' }, id: 'd' }] };
const consoleCall = (text: string, id: string) => ({
  toolCalls: [{ name: 'run_script_console', id, input: { editorAt: [0.8, 0.4], text, executeKey: 'Control+Enter', expectOutput: 'objects 3', editorText: 'Script' } }],
});

async function run(layer: FakeLayer, replies: Array<{ toolCalls: Array<{ name: string; input: unknown; id: string }> }>) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Run the program in the script console' }] } });
  const scripted = new ScriptedModel(replies);
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r1',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 'sys', tools: [...toolsForRun({ disabled: ['hover'], vision: true, pointAt: true }), SCRIPT_CONSOLE_TOOL],
    layer, host: new FakeHost(), signal: new AbortController().signal,
    emit: () => undefined, turnCap: 6,
  });
  const end = await loop.run();
  const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result');
  return { end, scripted, results: results as Array<{ toolName: string; text: string; isError?: boolean }> };
}

const layerWith = (output: string) => { let reads = 0; return new FakeLayer({
  wait: () => ok('wait · met'),
  canvas: args => ({ ok: true, text: `canvas ${String(args.action)} · changed`, receipt: receipt('canvas') }),
  read: () => ok(reads++ === 0 ? 'Output: (empty)' : `Output: ${output}`),
}); };

describe('run_script_console in a run', () => {
  it('can be selected and runs every phase through the layer in one model turn', async () => {
    const layer = layerWith('objects 3');
    const { end, scripted, results } = await run(layer, [consoleCall('print(3)', 'c1'), done]);
    expect(end.outcome).toBe('success');
    expect(scripted.calls).toHaveLength(2);
    const phases = layer.calls.map(c => `${c.tool}${c.args.action ? ':' + String(c.args.action) : ''}`);
    expect(phases).toEqual(expect.arrayContaining(['wait', 'canvas:click', 'canvas:type', 'canvas:key', 'read']));
    const typed = layer.calls.find(c => c.tool === 'canvas' && c.args.action === 'type');
    expect(typed?.args.replace).toBe(true);
    expect(results.find(r => r.toolName === 'run_script_console')?.text).toContain('All phases passed');
  });
  it('reports a verification failure with the Output, and refuses the same program on the same document', async () => {
    const layer = layerWith('TypeError: x is not a function');
    const { results } = await run(layer, [consoleCall('print(3)', 'c1'), consoleCall('print(3)', 'c2'), done]);
    const consoles = results.filter(r => r.toolName === 'run_script_console');
    expect(consoles[0]!.isError).toBe(true);
    expect(consoles[0]!.text).toContain('Stopped at verify');
    expect(consoles[1]!.isError).toBe(true);
    expect(consoles[1]!.text).toContain('already ran');
  });
  it('stops before typing when the editor is not visible (wrong menu opened)', async () => {
    const layer = new FakeLayer({
      wait: () => failed('TIMEOUT', 'not on the page'),
      canvas: () => ({ ok: true, text: 'canvas', receipt: receipt('canvas') }),
      read: () => ok('Output: objects 3'),
    });
    const { results } = await run(layer, [consoleCall('print(3)', 'c1'), done]);
    expect(results.find(r => r.toolName === 'run_script_console')?.text).toContain('Stopped at targetEditor');
    expect(layer.calls.some(c => c.tool === 'canvas' && c.args.action === 'type')).toBe(false);
  });
});

describe('the documentation gate and verified playbook templates', () => {
  it('lets a program through when every method it calls is in the verified guidance, and still refuses an invented API', async () => {
    const make = async (program: string, system: string) => {
      const c = await createConversation({ mode: 'ask' });
      await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Run the program' }] } });
      const scripted = new ScriptedModel([
        { toolCalls: [{ name: 'canvas', id: 't1', input: { action: 'type', text: program, replace: true, intent: 'enter the script' } }] },
        { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
      ]);
      const layer = new FakeLayer({ canvas: () => ({ ok: true, text: 'canvas type', receipt: receipt('canvas') }) });
      const loop = new AgentLoop({
        conversationId: c.id, runId: 'r1',
        model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
        system, tools: toolsForRun({ vision: true, pointAt: true }), layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 4,
      });
      await loop.run();
      return layer.calls.some(x => x.tool === 'canvas' && x.args.action === 'type');
    };
    const program = 'var l = ActiveLayer; var r = l.CreateRectangle(20, 90, 70, 50, 0); r.Fill.ApplyUniformFill(Color.RGB(0, 0, 255));';
    expect(await make(program, 'Playbook: l.CreateRectangle(x, y, w, h, r) and r.Fill.ApplyUniformFill(Color.RGB(r, g, b)) are verified.')).toBe(true);
    expect(await make(program.replace('CreateRectangle', 'MakeBox'), 'Playbook: l.CreateRectangle(x, y, w, h, r) and r.Fill.ApplyUniformFill(Color.RGB(r, g, b)) are verified.')).toBe(false);
  });
});
