import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vault = readFileSync(new URL('./credentialVault.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/integrations/CustomCredentialsSection.tsx', import.meta.url), 'utf8');

test('browser vault has no new secret writer or general reveal API', () => {
  assert.doesNotMatch(vault, /export function (?:addCredential|saveCredentials|revealCredential|setVaultPassword)/);
  assert.doesNotMatch(vault, /localStorage\.setItem\([^,]+,\s*(?:encrypted|payload|value)/);
  assert.match(vault, /Explicit migration read only/);
});

test('legacy browser import is selected, consented, server-vaulted and cleaned only after success', () => {
  assert.match(panel, /I consent to decrypt this selected browser record once/);
  const save = panel.indexOf("api.integrations.saveProviderKey('custom', plain");
  const cleanup = panel.indexOf('removeLegacyCredentialAfterImport(record.id, password)');
  assert.ok(save >= 0 && cleanup > save, 'server save must complete before browser cleanup');
  assert.doesNotMatch(panel, /navigator\.clipboard|Reveal|Save & Lock/);
  assert.match(panel, /Secret values can’t be revealed in the browser/);
});
