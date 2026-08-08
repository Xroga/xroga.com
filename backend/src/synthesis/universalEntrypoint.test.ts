/**
 * Tests for the production entrypoint into the universal path.
 *
 * The property that matters most is reachability. This function sits inside
 * `runBuildPipeline`, which serves every user build, so the important assertions are the
 * ones proving it does nothing at all unless a project is explicitly selected — and that
 * it cannot report success without a real commit.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readUniversalAgentFlags } from '../config/universalAgentFlags.js';
import {
  capabilityCandidates,
  parseGeneratedFiles,
  refusingCommit,
  tryUniversalBuild,
} from './universalEntrypoint.js';
import { InMemoryUniversalStore } from './universalPersistence.js';

const off = readUniversalAgentFlags({});
const shadow = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'shadow' });
const enabledForDemo = readUniversalAgentFlags({
  UNIVERSAL_AGENT_ENABLED: 'enabled',
  UNIVERSAL_AGENT_ALLOWLIST: 'demo-project',
});

const base = {
  userId: 'user-1',
  prompt: 'Build a Rust CLI that converts CSV files to JSON',
  commit: refusingCommit('no repository connected in this test'),
};

describe('the entrypoint is unreachable unless a project is selected', () => {
  // It sits inside runBuildPipeline, which serves every user build. Returning null must be
  // the overwhelmingly normal answer.
  it('returns null when the flag is off', async () => {
    assert.equal(await tryUniversalBuild({ ...base, projectId: 'demo-project', flags: off }), null);
  });

  it('returns null in shadow mode, which is production today', async () => {
    assert.equal(await tryUniversalBuild({ ...base, projectId: 'demo-project', flags: shadow }), null);
  });

  it('returns null for a project that is not allowlisted', async () => {
    assert.equal(
      await tryUniversalBuild({ ...base, projectId: 'someone-elses-project', flags: enabledForDemo }),
      null,
    );
  });

  it('returns null when there is no project id at all', async () => {
    assert.equal(await tryUniversalBuild({ ...base, projectId: null, flags: enabledForDemo }), null);
  });

  it('engages only for the allowlisted project', async () => {
    const outcome = await tryUniversalBuild({
      ...base, projectId: 'demo-project', flags: enabledForDemo, store: new InMemoryUniversalStore(),
    });
    assert.ok(outcome, 'the allowlisted project must reach the universal path');
    assert.equal(outcome!.ran, true);
  });
});

describe('the capability router decides, not the legacy router', () => {
  it('builds candidates from the runtime model registry', () => {
    // §8's bridge: the legacy router picks by hand-written strength scores, and this turns
    // the same registry into profiles the capability router ranks by provenance.
    const candidates = capabilityCandidates();
    assert.ok(candidates.length > 0, 'the registry should yield candidates');
    for (const candidate of candidates) {
      assert.ok(candidate.profile.modelId);
      assert.ok(candidate.profile.capabilityScores.length > 0);
      assert.ok(
        candidate.profile.capabilityScores.every((score) => score.provenance === 'declared'),
        'every score starts declared until outcomes accumulate — the honest starting point',
      );
    }
  });

  it('records the selected model and its fallbacks on the outcome', async () => {
    const outcome = await tryUniversalBuild({
      ...base, projectId: 'demo-project', flags: enabledForDemo, store: new InMemoryUniversalStore(),
    });
    assert.ok(outcome);
    assert.ok(outcome!.routing.reason.length > 0, 'the route must explain itself');
    assert.ok(Array.isArray(outcome!.routing.fallbacks));
  });
});

describe('a run cannot report success without a real commit', () => {
  // Returning a fake SHA, or skipping the commit and reporting success, would produce a
  // "completed" build with nothing in source control.
  it('refuses to commit and says why', async () => {
    const commit = refusingCommit('no GitHub repository is connected for this project');
    await assert.rejects(
      async () => commit({ files: [], message: 'x' }),
      /Refusing to commit.*no GitHub repository is connected/s,
    );
  });

  it('names the false-result risk in the refusal', async () => {
    const commit = refusingCommit('test');
    await assert.rejects(async () => commit({ files: [], message: 'x' }), /would be a false result/);
  });
});

describe('generated file parsing is bounded', () => {
  it('reads a plain JSON file map', () => {
    const files = parseGeneratedFiles('{"files":[{"path":"src/main.rs","content":"fn main() {}"}]}');
    assert.deepEqual(files, [{ path: 'src/main.rs', content: 'fn main() {}' }]);
  });

  it('tolerates the fence models add', () => {
    const files = parseGeneratedFiles('```json\n{"files":[{"path":"a.rs","content":"x"}]}\n```');
    assert.equal(files.length, 1);
  });

  it('refuses traversal and absolute paths at the boundary', () => {
    // The patch workspace catches these too. Catching them here means the run reports a bad
    // generation rather than a rejected write.
    const files = parseGeneratedFiles(JSON.stringify({
      files: [
        { path: '../../etc/passwd', content: 'x' },
        { path: '/etc/shadow', content: 'x' },
        { path: 'src/ok.rs', content: 'fine' },
      ],
    }));
    assert.deepEqual(files.map((file) => file.path), ['src/ok.rs']);
  });

  it('returns nothing rather than throwing on unparsable output', () => {
    assert.deepEqual(parseGeneratedFiles('I could not complete that request.'), []);
    assert.deepEqual(parseGeneratedFiles(''), []);
    assert.deepEqual(parseGeneratedFiles('{"files": "not an array"}'), []);
  });

  it('drops entries missing a path or content instead of inventing them', () => {
    const files = parseGeneratedFiles(JSON.stringify({
      files: [{ path: 'a.rs' }, { content: 'orphan' }, { path: 'b.rs', content: 'ok' }],
    }));
    assert.deepEqual(files.map((file) => file.path), ['b.rs']);
  });
});
