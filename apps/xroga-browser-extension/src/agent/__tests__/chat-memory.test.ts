import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import type { ScriptedCall, ScriptedReply } from '@src/llm';
import { appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { agentSystemPrompt } from '../prompt';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer, ok, receipt } from '../testing/fake-layer';
import { withSummaries } from '../testing/scripts';

afterEach(async () => {
  await closeDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

function build(conversationId: string, runId: string, script: (call: ScriptedCall) => ScriptedReply, layer: FakeLayer) {
  const scripted = new ScriptedModel(script);
  const profile = resolveProfile({ kind: 'ollama', modelName: 'small', overrides: { contextWindow: 32_768 } });
  const loop = new AgentLoop({
    conversationId,
    runId,
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile, reasoning: 'none' },
    system: agentSystemPrompt({ tools: ['snapshot', 'read', 'click', 'done'] }),
    tools: toolsForRun({ disabled: ['find', 'screenshot', 'wait', 'set', 'type', 'press', 'navigate', 'handle_dialog', 'fill_form', 'hover', 'scroll', 'tabs', 'ask_user', 'upload'], vision: false }),
    layer,
    host: new FakeHost(),
    signal: new AbortController().signal,
    emit: () => undefined,
    turnCap: 20,
    mode: () => 'auto',
  });
  return { loop, scripted };
}

function layerWithClicks() {
  return new FakeLayer({
    click: (_args, i) =>
      ok(`click · [a${i}] button «Message client ${i}» · pointer · dispatched`, {
        receipt: receipt({ target: `[a${i}] button «Message client ${i}»`, sensitive: 'submit', allowedBy: 'auto' }),
        page: { tabId: 1, rev: i, url: 'https://crm.example/', title: 'CRM' } as never,
      }),
  });
}

describe('a chat remembers what was said in it', () => {
  it('the next message in the same chat reaches the model with the earlier request, the agent’s own report and the steps taken', async () => {
    const c = await createConversation({ mode: 'auto' });
    const request = 'I run a car recovery business in Dubai. Message these 10 clients from my CRM about the new 300 AED offer.';
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: request }] } });

    // First run: three messages sent, then a report that skips two clients.
    const report = 'Messaged 8 of 10 clients. Skipped Ali (no phone number) and Sara (opted out of messages).';
    const first = build(
      c.id,
      'run-1',
      withSummaries(
        (_call, i) =>
          i <= 3
            ? { toolCalls: [{ name: 'click', input: { target: { ref: `a${i}` }, intent: `Message client ${i}` }, id: `c${i}` }] }
            : { text: report },
        () => ({ text: 'Outreach summary.' }),
      ),
      layerWithClicks(),
    );
    await first.loop.run();

    // The user writes again in the same chat.
    const question = 'Why did you skip two of them?';
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: question }] } });
    const second = build(c.id, 'run-2', () => ({ text: 'Ali had no phone number and Sara opted out.' }), layerWithClicks());
    await second.loop.run();

    const sent = JSON.stringify(second.scripted.calls[0].prompt);
    expect(sent).toContain('car recovery business in Dubai');
    expect(sent).toContain('300 AED offer');
    expect(sent).toContain('Skipped Ali (no phone number) and Sara (opted out of messages)');
    expect(sent).toContain(question);
    // The steps already taken are listed, so the new run does not start over.
    expect(sent).toContain('Steps already taken in this conversation');
    expect(sent).toContain('done · click: Message client 1');
    expect(sent).toContain('do not repeat the ones marked done');
  });

  it('a new chat starts empty', async () => {
    const a = await createConversation({ mode: 'auto' });
    await appendEntry(a.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'secret plan: launch on Friday' }] } });
    const b = await createConversation({ mode: 'auto' });
    await appendEntry(b.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'hello' }] } });
    const run = build(b.id, 'run-b', () => ({ text: 'hi' }), layerWithClicks());
    await run.loop.run();
    expect(JSON.stringify(run.scripted.calls[0].prompt)).not.toContain('launch on Friday');
  });
});
