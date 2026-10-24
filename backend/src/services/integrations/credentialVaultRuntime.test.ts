import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import { openRuntimeCredential, resetCredentialVaultRuntimeForTests, runtimeCredentialVault } from './credentialVaultRuntime.js';

test('isolated test vault shares only its per-run key across API and verification processes and refuses it in production', async () => {
  const previous = { mode: process.env.NODE_ENV, key: process.env.XROGA_TEST_CREDENTIAL_KEK };
  process.env.NODE_ENV = 'test';
  process.env.XROGA_TEST_CREDENTIAL_KEK = randomBytes(32).toString('base64url');
  resetCredentialVaultRuntimeForTests();
  const owner = '11111111-1111-4111-8111-111111111111';
  const binding = { provider:'fixture', account:'fixture', credentialType:'api-key', recordId:'fixture', revision:'one', scope:'fixture' };
  try {
    const child = `import {sealRuntimeCredential} from './backend/src/services/integrations/credentialVaultRuntime.ts';
      process.stdout.write(await sealRuntimeCredential(${JSON.stringify(owner)},${JSON.stringify(binding)},'synthetic-cross-process'));`;
    const envelope = execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e',child], {
      cwd: resolve(import.meta.dirname,'../../../..'), encoding:'utf8', env:process.env,
    });
    assert.equal(await openRuntimeCredential(owner,binding,envelope),'synthetic-cross-process');
    resetCredentialVaultRuntimeForTests();
    process.env.XROGA_TEST_CREDENTIAL_KEK = randomBytes(32).toString('base64url');
    await assert.rejects(openRuntimeCredential(owner,binding,envelope),/could not authenticate/);
    resetCredentialVaultRuntimeForTests();
    process.env.XROGA_TEST_CREDENTIAL_KEK = 'malformed';
    assert.throws(runtimeCredentialVault,/Invalid ephemeral test credential key/);
    process.env.NODE_ENV = 'production';
    assert.throws(runtimeCredentialVault,/KMS is not configured/);
  } finally {
    resetCredentialVaultRuntimeForTests();
    if(previous.mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.mode;
    if(previous.key===undefined)delete process.env.XROGA_TEST_CREDENTIAL_KEK;else process.env.XROGA_TEST_CREDENTIAL_KEK=previous.key;
  }
});
