import { describe, expect, it, vi } from 'vitest';

let reply: unknown;
vi.mock('../bridge', () => ({ workspaceRequest: vi.fn(async () => reply) }));

import { runRepositoryTool } from '../plugins';

const wrap = (text: string) => `[wrapped]${text}`;
const signal = new AbortController().signal;

describe('what run_repository tells the model', () => {
  it('reports the other repositories, the skill inspection, the installed packages and the licence report, not only the main repository', async () => {
    reply = {
      repository: 'mahmoud/boltons', commit: 'd31d821d56c8f7756af9c30a864077f2e5855321', filesSent: 153, omittedFiles: 0, exitCode: 0,
      stdout: 'slug: xroga', stderr: '', durationMs: 191,
      repositories: [{ repository: 'more-itertools/more-itertools', commit: 'c0ede7fcd50340170bc7f428b7b658f6e767a34c', directory: 'more-itertools' }],
      skill: { found: true, directory: '.claude/skills/maps', name: 'maps', description: 'Scrapes maps', risk: 'review', problems: [], scripts: [{ path: 'run.py', signals: ['network'] }] },
      dependencies: [{ name: 'requests', version: '2.32.3', licence: 'Apache-2.0' }],
      licenceReport: 'requests: Apache-2.0',
    };
    const out = await runRepositoryTool('run-1', { url: 'https://github.com/mahmoud/boltons', command: 'python3' }, signal, wrap);
    expect(out.isError).toBe(false);
    expect(out.text).toContain('mahmoud/boltons@d31d821d56c8');
    expect(out.text).toContain('also ran more-itertools/more-itertools@c0ede7fcd503 in more-itertools/');
    expect(out.text).toContain('skill inspection of .claude/skills/maps: name maps, Scrapes maps; risk review; scripts run.py [network]');
    expect(out.text).toContain('installed: requests@2.32.3 (Apache-2.0)');
    expect(out.text).toContain('licence report: requests: Apache-2.0');
    expect(out.text).toContain('slug: xroga');
  });

  it('is unchanged for a plain single-repository run', async () => {
    reply = { repository: 'a/b', commit: 'f'.repeat(40), filesSent: 3, exitCode: 0, stdout: 'hi', stderr: '', durationMs: 5 };
    const out = await runRepositoryTool('run-2', { url: 'https://github.com/a/b', command: 'python3' }, signal, wrap);
    expect(out.text).not.toContain('also ran');
    expect(out.text).not.toContain('skill inspection');
    expect(out.text).toContain('stdout:');
  });
});
