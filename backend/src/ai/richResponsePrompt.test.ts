import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHAT_SYSTEM, chatPresentationSystem } from './prompts.js';

test('actual chat contract keeps essential schemas and safety without unrelated example overload', () => {
  const system = chatPresentationSystem('Explain a proposed application architecture with a diagram.');
  const examples = system.split('\n').filter(line => line.startsWith('{"type":')).map(line => JSON.parse(line));
  assert.equal(examples.length, 8);
  assert.equal(new Set(examples.map(example => example.type)).size, examples.length);
  assert.ok(examples.some(example => example.type === 'graph' && example.edges.length));
  assert.ok(examples.some(example => example.type === 'calculator'));
  assert.doesNotMatch(system, /\{"type":"api-request"/);
  assert.match(system, /Never use user_metadata or raw_user_meta_data for authorization/);
  assert.match(system, /Do not substitute ASCII/);
  assert.ok(system.length < CHAT_SYSTEM.length);
  assert.match(chatPresentationSystem('Explain this calendar'), /\{"type":"calendar"/);
});

test('chat answers may request safe rich output without fabricating visual data', () => {
  assert.match(CHAT_SYSTEM, /```xroga-ui|labelled xroga-ui/i);
  assert.match(CHAT_SYSTEM, /never invent values/i);
  assert.match(CHAT_SYSTEM, /strict JSON only/i);
  assert.match(CHAT_SYSTEM, /No HTML, scripts, callbacks, actions/i);
  assert.match(CHAT_SYSTEM, /normal Markdown table/i);
  assert.match(CHAT_SYSTEM, /progress view/i);
  assert.match(CHAT_SYSTEM, /calculator/i);
  assert.match(CHAT_SYSTEM, /full installed Lucide catalog/i);
  assert.match(CHAT_SYSTEM, /Do not decorate responses with emoji/i);
  assert.match(CHAT_SYSTEM, /calculation breakdown/i);
  assert.match(CHAT_SYSTEM, /scorecard/i);
  assert.match(CHAT_SYSTEM, /file tree/i);
  assert.match(CHAT_SYSTEM, /accordion/i);
  assert.match(CHAT_SYSTEM, /source list/i);
  assert.match(CHAT_SYSTEM, /"type":"card-grid"/i);
  assert.match(CHAT_SYSTEM, /"type":"tree"/i);
  assert.match(CHAT_SYSTEM, /"type":"json"/i);
  assert.match(CHAT_SYSTEM, /"type":"api-request"/i);
  assert.match(CHAT_SYSTEM, /"type":"diff"/i);
  assert.match(CHAT_SYSTEM, /"chartType":"donut"/i);
  assert.match(CHAT_SYSTEM, /"chartType":"radar"/i);
  assert.match(CHAT_SYSTEM, /"chartType":"funnel"/i);
  assert.match(CHAT_SYSTEM, /authorization headers, cookies, tokens, or secrets/i);
});

test('every compact rich-output example is strict JSON', () => {
  const examples = CHAT_SYSTEM.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('{'));
  assert.ok(examples.length >= 10);
  for (const example of examples) assert.doesNotThrow(() => JSON.parse(example));
});

test('conceptual architecture does not require a live data tool and demonstrates connected nodes', () => {
  assert.match(CHAT_SYSTEM, /Conceptual diagrams.*do not require live retrieval/);
  assert.doesNotMatch(CHAT_SYSTEM, /Use a visual only when actual sourced or tool data supports it/);
  const graph = CHAT_SYSTEM.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)).find(block => block.type === 'graph');
  assert.ok(graph.nodes.length >= 2);
  assert.ok(graph.edges.length >= 1);
  for (const edge of graph.edges) {
    assert.ok(graph.nodes.some((node: {id: string}) => node.id === edge.source));
    assert.ok(graph.nodes.some((node: {id: string}) => node.id === edge.target));
  }
});

test('security guidance excludes user-editable authorization and distinguishes webhook deduplication', () => {
  assert.match(CHAT_SYSTEM, /Never use.*raw_user_meta_data.*authorization/);
  assert.match(CHAT_SYSTEM, /current server-owned membership/);
  assert.match(CHAT_SYSTEM, /webhook.*event ID/);
});

test('rich output is composed in the original answer with truthful boundaries', () => {
  assert.match(CHAT_SYSTEM, /at the point in the explanation where it belongs/);
  assert.doesNotMatch(CHAT_SYSTEM, /Add one data-only fenced block labelled xroga-ui after the explanatory prose/);
  assert.match(CHAT_SYSTEM, /actual components and directed connections/);
  assert.match(CHAT_SYSTEM, /complete essential explanation outside optional controls/);
  assert.match(CHAT_SYSTEM, /privileged server credentials may bypass/);
  assert.match(CHAT_SYSTEM, /tenant headers are not proof of identity/);
  assert.match(CHAT_SYSTEM, /fixed scenario rather than the calculator's current inputs/);
});
