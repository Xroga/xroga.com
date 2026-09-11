import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const integrationsPage = readFileSync(
  new URL('../app/integrations/page.tsx', import.meta.url),
  'utf8',
);
const intelligenceSection = readFileSync(
  new URL('../components/homepage/XrogaIntelligenceSection.tsx', import.meta.url),
  'utf8',
);

describe('launch claims stay inside executable capability boundaries', () => {
  it('labels the integration list as a technology catalog rather than automatic runtime connections', () => {
    assert.match(integrationsPage, /technologies in Xroga/);
    assert.match(integrationsPage, /code-integration option, not a pre-connected service/);
    assert.doesNotMatch(integrationsPage, /routes swarm tasks to the right integration automatically/);
  });

  it('does not promise a one-million-token end-to-end request surface', () => {
    assert.match(intelligenceSection, /Focused Context/);
    assert.doesNotMatch(intelligenceSection, /1M\+ Context/);
  });
});
