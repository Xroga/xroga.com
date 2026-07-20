import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatResearchForPrompt, type ResearchBundle } from './research.js';

describe('formatResearchForPrompt', () => {
  it('returns empty string when research is empty (no fake research block)', () => {
    const empty: ResearchBundle = {
      query: 'test',
      summary: '',
      sources: [],
      provider: 'none',
    };
    assert.equal(formatResearchForPrompt(empty), '');
  });

  it('includes provider and X note for grok_live', () => {
    const bundle: ResearchBundle = {
      query: 'okx hackathon',
      summary: 'Live summary',
      sources: [
        {
          title: 'x.com',
          url: 'https://x.com/okx/status/1',
          snippet: 'post',
          source: 'x',
        },
      ],
      provider: 'grok_live',
      includedXSearch: true,
    };
    const text = formatResearchForPrompt(bundle);
    assert.match(text, /grok_live/);
    assert.match(text, /includes live X search/);
    assert.match(text, /Live summary/);
    assert.match(text, /x\.com/);
  });
});
