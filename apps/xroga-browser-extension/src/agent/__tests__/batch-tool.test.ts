import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { activeBranch, appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { BATCH_TOOL } from '../batch-plan';
import { FakeHost, FakeLayer, failed, ok } from '../testing/fake-layer';
import type { Result } from '@src/browser-control';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const receipt = (action: string): Result['receipt'] => ({ action, mechanism: 'pointer', dispatched: true, effect: { verdict: 'changed', signals: ['1 mutation'] } });
const clickResult = (name: string): Result => ({ ok: true, text: `click ${name} · changed`, receipt: receipt('click') });
const done = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'Finished.' }, id: 'd' }] };

async function run(layer: FakeLayer, replies: Array<{ toolCalls: Array<{ name: string; input: unknown; id: string }> }>) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Fill in the form and move on' }] } });
  const scripted = new ScriptedModel(replies);
  const emitted: Array<{ type: string; row?: { toolCallId: string; tool: string; status: string } }> = [];
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r1',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 'sys', tools: [...toolsForRun({ disabled: ['hover'], vision: false }), BATCH_TOOL],
    layer, host: new FakeHost(), signal: new AbortController().signal,
    emit: event => emitted.push(event as never), turnCap: 6,
  });
  const end = await loop.run();
  const toolText = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result');
  return { end, scripted, emitted, toolText: toolText as Array<{ toolName: string; text: string; isError?: boolean }> };
}

describe('the batch tool in a run', () => {
  it('runs a flow in one model turn: conditions, a repeat and a last observation, through the layer', async () => {
    let nexts = 3;
    const layer = new FakeLayer({
      wait: args => {
        // Conditions are answered instantly through the layer's wait.
        if (args.text === 'Cookie banner') return failed('TIMEOUT', 'not on the page');
        if (args.textGone === 'Next') return nexts <= 0 ? ok('wait · met') : failed('TIMEOUT', 'still there');
        return ok('wait · met');
      },
      click: args => {
        const name = (args.target as { name?: string } | undefined)?.name ?? '';
        if (name === 'Next') nexts--;
        return clickResult(name);
      },
    });
    const { end, scripted, toolText } = await run(layer, [
      {
        toolCalls: [{
          name: 'batch', id: 'b1', input: { steps: [
            { tool: 'click', args: { target: { role: 'button', name: 'Accept' } }, when: { for: 'text', value: 'Cookie banner' } },
            { tool: 'click', args: { target: { role: 'button', name: 'Next' } }, repeat: { until: { for: 'text_gone', value: 'Next' }, max: 6 } },
            { tool: 'read' },
          ] },
        }],
      },
      done,
    ]);
    expect(end.outcome).toBe('success');
    // One batch call and one done: two model turns for a flow of five layer calls.
    expect(scripted.calls).toHaveLength(2);
    const clicks = layer.calls.filter(c => c.tool === 'click').map(c => (c.args.target as { name: string }).name);
    expect(clicks).toEqual(['Next', 'Next', 'Next']);
    const batch = toolText.find(t => t.toolName === 'batch')!;
    expect(batch.isError).toBeFalsy();
    expect(batch.text).toContain('skipped: text "Cookie banner" was false');
    expect(batch.text).toContain('✓ click ×3');
    expect(batch.text).toContain('✓ read');
  });

  it('observes the page only after the last step: earlier writes are quiet', async () => {
    const layer = new FakeLayer({ click: () => clickResult('x'), set: () => ({ ok: true, text: 'set · changed', receipt: receipt('set') }) });
    await run(layer, [
      { toolCalls: [{ name: 'batch', id: 'b', input: { steps: [{ tool: 'set', args: { target: { role: 'textbox', name: 'Name' }, value: 'Ada' } }, { tool: 'set', args: { target: { role: 'textbox', name: 'City' }, value: 'Paris' } }, { tool: 'click', args: { target: { role: 'button', name: 'Save' } } }] } }] },
      done,
    ]);
    const observe = layer.calls.filter(c => c.tool === 'set' || c.tool === 'click').map(c => c.args.observe);
    expect(observe).toEqual(['none', 'none', 'diff']);
  });

  it('stops at the first failing step, runs nothing after it, and reports the trail', async () => {
    const layer = new FakeLayer({
      click: args => ((args.target as { name?: string } | undefined)?.name === 'Missing' ? failed('NOT_FOUND', 'no such element') : clickResult('ok')),
    });
    const { toolText } = await run(layer, [
      { toolCalls: [{ name: 'batch', id: 'b', input: { steps: [{ tool: 'click', args: { target: { role: 'button', name: 'A' } } }, { tool: 'click', args: { target: { role: 'button', name: 'Missing' } } }, { tool: 'click', args: { target: { role: 'button', name: 'C' } } }] } }] },
      done,
    ]);
    const batch = toolText.find(t => t.toolName === 'batch')!;
    expect(batch.isError).toBe(true);
    expect(batch.text).toMatch(/✓ click → ✗ click: error NOT_FOUND/);
    expect(layer.calls.filter(c => c.tool === 'click')).toHaveLength(2);
  });

  it('refuses tools that may not run in a batch, before anything runs', async () => {
    const layer = new FakeLayer();
    const { toolText } = await run(layer, [
      { toolCalls: [{ name: 'batch', id: 'b', input: { steps: [{ tool: 'click', args: { target: { role: 'button', name: 'A' } } }, { tool: 'done', args: {} }] } }] },
      done,
    ]);
    const batch = toolText.find(t => t.toolName === 'batch')!;
    expect(batch.isError).toBe(true);
    expect(batch.text).toContain('cannot run inside a batch');
    expect(layer.calls.filter(c => c.tool === 'click')).toHaveLength(0);
  });

  it('a step that raises a page prompt ends the batch there, ok, with the reason', async () => {
    const layer = new FakeLayer({
      click: () => ({ ok: true, text: 'click · a dialog opened', receipt: receipt('click'), pending: [{ kind: 'dialog', type: 'confirm', message: 'Sure?' }] as never }),
    });
    const { toolText } = await run(layer, [
      { toolCalls: [{ name: 'batch', id: 'b', input: { steps: [{ tool: 'click', args: { target: { role: 'button', name: 'Delete' } } }, { tool: 'click', args: { target: { role: 'button', name: 'Again' } } }] } }] },
      done,
    ]);
    const batch = toolText.find(t => t.toolName === 'batch')!;
    expect(batch.text).toContain('The batch stopped here: a dialog or prompt is open');
    expect(layer.calls.filter(c => c.tool === 'click')).toHaveLength(1);
  });

  it('shows each step as its own activity row, started and ended', async () => {
    const layer = new FakeLayer({ click: () => clickResult('x') });
    const { emitted } = await run(layer, [
      { toolCalls: [{ name: 'batch', id: 'bb', input: { steps: [{ tool: 'click', args: { target: { role: 'button', name: 'A' } } }, { tool: 'click', args: { target: { role: 'button', name: 'B' } } }] } }] },
      done,
    ]);
    const rows = emitted.filter(e => e.row?.toolCallId.startsWith('bb#'));
    expect(rows.map(r => `${r.type}:${r.row!.tool}`)).toEqual([
      'tool_execution_start:click', 'tool_execution_end:click', 'tool_execution_start:click', 'tool_execution_end:click',
    ]);
    expect(rows.filter(r => r.type === 'tool_execution_end').every(r => r.row!.status === 'done')).toBe(true);
  });

  it('gives the page-reading steps the bot-check note like an ordinary call', async () => {
    const layer = new FakeLayer({ read: () => ok('read · tab 1 · «Just a moment...» · 60 characters\nChecking your browser before accessing shop.example') });
    const { toolText } = await run(layer, [{ toolCalls: [{ name: 'batch', id: 'b', input: { steps: [{ tool: 'read' }] } }] }, done]);
    expect(toolText.find(t => t.toolName === 'batch')!.text).toContain('interstitial');
  });
});
