import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FIND_SKILL_TOOL, READ_SKILL_TOOL, SKILL_CATALOG, renderSkill, searchSkills, skillById } from '../skill-catalog';
import { parseSkillMd } from '../skill-md';
import { FakeHost, FakeLayer } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('parseSkillMd (Agent Skills format)', () => {
  const ok = `---
name: pdf-forms
description: >
  Fill PDF forms.
  Use when a form is a PDF.
license: Apache-2.0
allowed-tools: Bash(git:*) Read
metadata:
  author: example
---
Body text.`;
  it('reads the documented fields, folded descriptions and metadata', () => {
    const r = parseSkillMd(ok);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skill.name).toBe('pdf-forms');
      expect(r.skill.description).toBe('Fill PDF forms. Use when a form is a PDF.');
      expect(r.skill.allowedTools).toEqual(['Bash(git:*)', 'Read']);
      expect(r.skill.metadata.author).toBe('example');
      expect(r.skill.body).toBe('Body text.');
    }
  });
  it('rejects what the spec rejects', () => {
    expect(parseSkillMd('no frontmatter').ok).toBe(false);
    expect(parseSkillMd('---\nname: Bad_Name\ndescription: x\n---\n').ok).toBe(false);
    expect(parseSkillMd('---\nname: ok-name\n---\n').ok).toBe(false);
    expect(parseSkillMd(`---\nname: ok-name\ndescription: ${'x'.repeat(1025)}\n---\n`).ok).toBe(false);
    expect(parseSkillMd('---\nname: ok-name\ndescription: x\n').ok).toBe(false);
  });
});

describe('the bundled catalog', () => {
  it('is valid, unique and carries honest verification levels', () => {
    expect(SKILL_CATALOG.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SKILL_CATALOG.map(c => c.id)).size).toBe(SKILL_CATALOG.length);
    for (const c of SKILL_CATALOG) {
      expect(['curated', 'fixture', 'live']).toContain(c.verified);
      expect(c.body.length).toBeGreaterThan(80);
      for (const d of c.docs) expect(d).toMatch(/^https:\/\//);
    }
    // Only the form skill has a real third-party run behind it.
    expect(SKILL_CATALOG.filter(c => c.verified === 'live').map(c => c.id)).toEqual(['forms-and-business-apps']);
  });
  it('spend and write skills say that approvals are required', () => {
    for (const c of SKILL_CATALOG.filter(c => c.risk === 'spend' || c.risk === 'write')) expect(c.body.toLowerCase()).toMatch(/approval|approve/);
  });
});

describe('searchSkills', () => {
  const top = (q: string, host?: string) => searchSkills(q, { host })[0]?.card.id;
  it('finds domain skills from the task alone', () => {
    expect(top('set up a Google Ads search campaign with negative keywords')).toBe('google-ads-search-campaigns');
    expect(top('add a discount code and update product inventory in my store')).toBe('shopify-store-admin');
    expect(top('split the clip on the video timeline and export')).toBe('video-timeline-editor');
    expect(top('update the deal stage for this contact in the CRM')).toBe('crm-records');
  });
  it('lets the page host decide when the words are generic', () => {
    expect(top('set this up for me', 'ads.google.com')).toBe('google-ads-search-campaigns');
    expect(top('check this out', 'admin.shopify.com')).toBe('shopify-store-admin');
  });
  it('returns nothing for an unrelated request and never more than the limit', () => {
    expect(searchSkills('zzzz qqqq')).toEqual([]);
    expect(searchSkills('campaign product store record page', { limit: 2 }).length).toBeLessThanOrEqual(2);
  });
  it('renders a skill as guidance that grants nothing, with documentation links', () => {
    const text = renderSkill(skillById('google-ads-search-campaigns')!);
    expect(text).toContain('grants no permission');
    expect(text).toContain('https://support.google.com/google-ads');
  });
});

describe('find_skill and read_skill in a run', () => {
  it('lets the model discover a skill and read it in two cheap local calls', async () => {
    const c = await createConversation({ mode: 'ask' });
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Configure a Google Ads search campaign for my plumbing business' }] } });
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'find_skill', id: 'f1', input: { query: 'google ads search campaign' } }] },
      { toolCalls: [{ name: 'read_skill', id: 'r1', input: { id: 'google-ads-search-campaigns' } }] },
      { toolCalls: [{ name: 'read_skill', id: 'r2', input: { id: 'no-such-skill' } }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ]);
    const loop = new AgentLoop({
      conversationId: c.id, runId: 'r1',
      model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
      system: 'sys', tools: [...toolsForRun({ vision: false }), FIND_SKILL_TOOL, READ_SKILL_TOOL],
      layer: new FakeLayer({}), host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 8,
    });
    await loop.run();
    const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string; isError?: boolean }>;
    const find = results.find(r => r.toolName === 'find_skill')!;
    expect(find.text).toContain('google-ads-search-campaigns');
    expect(find.text.length).toBeLessThan(1200);
    const read = results.filter(r => r.toolName === 'read_skill');
    expect(read[0]!.text).toContain('Never promise profit');
    expect(read[1]!.isError).toBe(true);
  });
});
