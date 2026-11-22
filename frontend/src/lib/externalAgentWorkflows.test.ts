import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXTERNAL_AGENTS, EXTERNAL_AGENT_DISCLOSURE } from './externalAgentWorkflows';

test('agent interoperability guides include recognizable providers and correct repository handoff', () => {
  const ids = EXTERNAL_AGENTS.map(agent => agent.id);
  assert.deepEqual(ids, ['codex', 'claude-code', 'cursor', 'copilot', 'gemini-cli', 'cline']);
  assert.equal(new Set(ids).size, ids.length);
  for (const agent of EXTERNAL_AGENTS) {
    assert.ok(agent.name && agent.maker && agent.logoId);
    assert.ok(agent.summary.includes('Xroga') || agent.detail.includes('Xroga'));
    assert.equal(agent.workflow.length, 3);
    assert.match(agent.workflow[0], /GitHub|repository/i);
    assert.match(agent.workflow[1], /branch|GitHub|commit|pull request|PR|repository|push/i);
    assert.match(agent.workflow[2], /Xroga/);
    assert.match(agent.vendorDocumentation, /^https:\/\//);
    assert.ok(agent.detail.toLowerCase().includes('not') || agent.detail.includes('GitHub'));
  }
});

test('no native inbound Xroga MCP endpoint or external agent authorization is promised', () => {
  assert.match(EXTERNAL_AGENT_DISCLOSURE, /not direct agent-to-Xroga OAuth/);
  assert.match(EXTERNAL_AGENT_DISCLOSURE, /GitHub repositories/);
  assert.ok(EXTERNAL_AGENTS.every(agent => !agent.workflow.some(step =>
    /connect directly to Xroga MCP|sign in to Codex from Xroga|linked account is ready/i.test(step)
  )));
});
