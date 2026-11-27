import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const integrationsPage = readFileSync(
  new URL('../app/integrations/page.tsx', import.meta.url),
  'utf8',
);
const integrationsMarketplace = readFileSync(
  new URL('../app/integrations/IntegrationsMarketplace.tsx', import.meta.url),
  'utf8',
);
const intelligenceSection = readFileSync(
  new URL('../components/homepage/XrogaIntelligenceSection.tsx', import.meta.url),
  'utf8',
);
const connectedServices = readFileSync(
  new URL('../components/integrations/ConnectedServicesSection.tsx', import.meta.url),
  'utf8',
);
const platformDocs = readFileSync(new URL('./platformDocsContent.ts', import.meta.url), 'utf8');
const creationIntelligence = readFileSync(new URL('./creationIntelligence.ts', import.meta.url), 'utf8');

describe('launch claims stay inside executable capability boundaries', () => {
  it('keeps app discovery separate from account connection and external-action authority', () => {
    assert.match(integrationsPage, /items=\{PUBLIC_INTEGRATION_CARDS\}/);
    assert.match(integrationsMarketplace, /A listing is not a connected account; confirm access inside your workspace/);
    assert.match(integrationsMarketplace, /Every external action remains subject to authorization and approval/);
    assert.match(integrationsMarketplace, /not a direct agent-to-Xroga connection/);
    assert.doesNotMatch(`${integrationsPage}\n${integrationsMarketplace}`, /routes swarm tasks to the right integration automatically/);
  });

  it('does not promise a one-million-token end-to-end request surface', () => {
    assert.match(intelligenceSection, /Focused Context/);
    assert.doesNotMatch(intelligenceSection, /1M\+ Context/);
  });

  it('does not expose retired Lemon Squeezy setup as a current connection or generated-product default', () => {
    assert.doesNotMatch(`${connectedServices}\n${platformDocs}\n${creationIntelligence}`, /Lemon Squeezy/i);
    assert.match(connectedServices, /Add credentials/);
    assert.match(platformDocs, /external actions require authorization and provider evidence/);
  });
});
