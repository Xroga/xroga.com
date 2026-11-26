import { describe, expect, it } from 'vitest';
import { parseSkillMd } from '../skill-md';
import { applyCompaction, protectedSkills, SHORT_RESULT } from '../compaction';

describe('parseSkillMd, plain values over several lines', () => {
  const text = ['---', 'name: long-description', 'description: Fill PDF forms', '  and read their fields back.', 'allowed-tools:', '  - Read', '  - Grep', '---', 'Body.'].join('\n');
  it('folds a plain value that carries on over indented lines, and reads a list under a key', () => {
    const r = parseSkillMd(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skill.description).toBe('Fill PDF forms and read their fields back.');
      expect(r.skill.allowedTools).toEqual(['Read', 'Grep']);
    }
  });
});

describe('parseSkillMd, lenient mode for skills written for other clients', () => {
  const make = (name: string, description = 'ok') => `---\nname: ${name}\ndescription: ${description}\n---\nBody.`;
  it('stays strict by default and loads cosmetic problems when asked to be lenient', () => {
    expect(parseSkillMd(make('Brand-Guidelines')).ok).toBe(false);
    expect(parseSkillMd(make('a'.repeat(70))).ok).toBe(false);
    const upper = parseSkillMd(make('Brand-Guidelines'), { lenient: true });
    expect(upper.ok && upper.skill.name).toBe('brand-guidelines');
    expect(parseSkillMd(make('a'.repeat(70)), { lenient: true }).ok).toBe(true);
    expect(parseSkillMd(make('x', 'd'.repeat(1500)), { lenient: true }).ok).toBe(true);
  });
  it('reads a name in another language, and still skips a skill with no description or an unusable name', () => {
    const r = parseSkillMd(make('PDF-処理'), { lenient: true });
    expect(r.ok && r.skill.name).toBe('pdf-処理');
    expect(parseSkillMd('---\nname: fine\n---\nBody.', { lenient: true }).ok).toBe(false);
    expect(parseSkillMd(make('bad name!'), { lenient: true }).ok).toBe(false);
    expect(parseSkillMd(make('two--hyphens'), { lenient: true }).ok).toBe(false);
  });
});

const msg = (id: string, role: 'user' | 'assistant' | 'tool', text: string, toolName = 'read') =>
  ({
    id,
    type: 'message',
    parentId: null,
    conversationId: 'c',
    at: 0,
    message: role === 'tool' ? { role, parts: [{ type: 'tool-result', toolCallId: id, toolName, text, isError: false }] } : { role, parts: [{ type: 'text', text }] },
  }) as never;

describe('skills opened earlier survive compaction', () => {
  const SKILL = 'Skill forms-and-business-apps: step one, step two. '.repeat(80);
  it('collects each skill once, newest copy kept, oldest first, and ignores failed reads', () => {
    const failed = { ...(msg('t3', 'tool', 'error: no skill has that id', 'read_skill') as object) } as { message: { parts: Array<{ isError: boolean }> } };
    failed.message.parts[0]!.isError = true;
    const found = protectedSkills([msg('u', 'user', 'task'), msg('t1', 'tool', SKILL, 'read_skill'), msg('t2', 'tool', 'OTHER SKILL', 'read_skill'), msg('t4', 'tool', SKILL, 'read_skill'), failed as never, msg('t5', 'tool', 'page text')]);
    expect(found).toEqual(['OTHER SKILL', SKILL]);
  });
  it('carries them into the shortened context word for word, and the step-3 cut leaves a skill alone', () => {
    const entries = [msg('u', 'user', 'task'), msg('t1', 'tool', SKILL, 'read_skill'), msg('a1', 'assistant', 'x'), msg('t2', 'tool', 'y'.repeat(SHORT_RESULT + 500), 'read'), msg('t3', 'tool', SKILL, 'read_skill')];
    const out = applyCompaction(entries, { id: 'k', conversationId: 'c', at: 0, firstKeptId: 't2', cutUpTo: 't3', summary: 'did things', ledger: [] } as never, new Set());
    const texts = out.map(e => e.message.parts.map(p => ('text' in p ? p.text : '')).join(''));
    expect(texts.some(t => t.includes('kept word for word') && t.includes(SKILL))).toBe(true);
    expect(texts.filter(t => t === SKILL).length).toBe(1);
    expect(texts.some(t => t.startsWith('yyyy') && t.length <= SHORT_RESULT + 200 && t.includes('cut to fit'))).toBe(true);
  });
});

import { skillFileUrl } from '../online-skills';
describe('skillFileUrl, files beside a pool skill', () => {
  const cand = { id: 'online:aas:x', provider: 'aas', name: 'x', description: 'x', confidence: 1, fetchUrl: 'https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/' + 'a'.repeat(40) + '/skills/pdf-forms/SKILL.md' };
  it('builds an address inside the skill folder at the same commit, for a plain text file', () => {
    expect(skillFileUrl(cand, 'references/REFERENCE.md')).toBe('https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/' + 'a'.repeat(40) + '/skills/pdf-forms/references/REFERENCE.md');
  });
  it('refuses a path that leaves the folder, a binary, another provider and another host', () => {
    expect(skillFileUrl(cand, '../other/SKILL.md')).toBeNull();
    expect(skillFileUrl(cand, '/etc/passwd')).toBeNull();
    expect(skillFileUrl(cand, 'assets/logo.png')).toBeNull();
    expect(skillFileUrl({ ...cand, provider: 'skillshub' }, 'a.md')).toBeNull();
    expect(skillFileUrl({ ...cand, fetchUrl: 'https://evil.test/sickn33/agentic-awesome-skills/' + 'a'.repeat(40) + '/skills/x/SKILL.md' }, 'a.md')).toBeNull();
  });
});
