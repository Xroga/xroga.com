import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Vercel connection is OAuth-only across the API and every deploy surface', () => {
  const api = source('frontend/src/lib/api.ts');
  const wizard = source('frontend/src/components/integrations/ConnectShipWizard.tsx');
  const gate = source('frontend/src/components/terminal/VercelBuildGateModal.tsx');
  const deploy = source('frontend/src/components/terminal/VercelDeployButton.tsx');
  const route = source('backend/src/routes/vercel.ts');

  for (const text of [api, wizard, gate, deploy]) {
    assert.doesNotMatch(text, /connectToken|connectWithToken|type="password"/);
  }
  assert.doesNotMatch(route, /router\.post\(['"]\/connect-token/);
  assert.match(gate, /Authorize with Vercel/);
  assert.match(wizard, /xroga_vercel_preferred_project/);
  assert.match(wizard, /xroga_vercel_preferred_team_id/);
});
