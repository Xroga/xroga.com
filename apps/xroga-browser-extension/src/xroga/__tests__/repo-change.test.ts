import { describe, expect, it, vi } from 'vitest';

let reply: unknown;
let failure: unknown;
let sent: { op: string; body: unknown } | undefined;
vi.mock('../bridge', () => ({
  workspaceRequest: vi.fn(async (op: string, args: { body: unknown }) => {
    sent = { op, body: args.body };
    if (failure) throw failure;
    return reply;
  }),
}));

import { CHANGE_REPO_TOOL, REPO_RUN_TOOL, changeRepositoryTool } from '../plugins';
import { kindOf } from '../../agent/tools';

const wrap = (text: string) => `[wrapped]${text}`;
const signal = new AbortController().signal;

describe('changing a public repository in the isolated sandbox', () => {
  it('sends the edits to the backend change route and shows the verdict, the tests before and after, and the diff', async () => {
    failure = undefined;
    reply = {
      repository: 'o/r', commit: 'a'.repeat(40), verdict: 'verified', verdictReason: 'passed twice', files: [{ path: 'a.py', kind: 'modified', additions: 1, deletions: 1 }],
      baseline: { status: 'passed', summary: '1 test run passed' }, after: { status: 'passed', summary: '1 test run passed' }, diff: 'diff --git a/a.py b/a.py',
    };
    const result = await changeRepositoryTool('run-1', { url: 'https://github.com/o/r', edits: [{ path: 'a.py', find: 'x', replace: 'y' }] }, signal, wrap);
    expect(sent?.op).toBe('repo-change');
    expect(result.isError).toBe(false);
    expect(result.text).toContain('verdict verified');
    expect(result.text).toContain('tests before: passed, after: passed');
    expect(result.text).toContain('diff --git a/a.py');
  });

  it('a change that breaks passing tests is an error result; a backend refusal names its reason and says not to repeat the call', async () => {
    failure = undefined;
    reply = { repository: 'o/r', commit: 'b'.repeat(40), verdict: 'failed', verdictReason: 'broke it', files: [], baseline: { status: 'passed', summary: '' }, after: { status: 'failed', summary: 'x', evidence: 'FAILED test_a' }, diff: '' };
    const broke = await changeRepositoryTool('run-1', { url: 'https://github.com/o/r', edits: [] }, signal, wrap);
    expect(broke.isError).toBe(true);
    expect(broke.text).toContain('FAILED test_a');
    failure = Object.assign(new Error('x'), { code: 'BROWSER_REPO_RUN_FAILED', detail: { providerMessage: ['The text to replace must occur exactly once in a.py.'] } });
    const refused = await changeRepositoryTool('run-1', { url: 'https://github.com/o/r', edits: [] }, signal, wrap);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('exactly once');
    expect(refused.text).toContain('do not repeat');
  });

  it('is a read-class tool (nothing is written anywhere), requires url and edits, and run_repository now accepts dependencies, more repositories and a skill directory', () => {
    expect(kindOf('change_repository', {})).toBe('read');
    expect(CHANGE_REPO_TOOL.parameters.required).toEqual(['url', 'edits']);
    const props = (REPO_RUN_TOOL.parameters as { properties: Record<string, unknown> }).properties;
    for (const name of ['dependencies', 'repositories', 'inspectSkill']) expect(props).toHaveProperty(name);
  });
});
