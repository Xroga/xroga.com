import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverCredentialUsage as discover } from './audit-credential-usage.mjs';
test('credential AST audit groups actual store/RPC/browser sites without emitting secret source values', () => {
  const input = `const TABLE='user_integrations';const KEY='xroga_vault_secrets';
    async function save(){await db.from(TABLE).upsert({access_token:'SYNTHETIC_SOURCE_SECRET_CANARY'});
      await db.rpc('save_oauth_connection',{p_access_token:token});
      await db.rpc('save_owned_runtime_secret',{p_secret:value});
      await db.storage.from('xroga-github-tokens').upload(path,body);localStorage.setItem(KEY,payload);}
    async function consume(){return getUserProviderKey(owner,provider);}`;
  const report = discover('backend/src/services/integrations/fixture.ts', input);
  assert.equal(report.rows.length, 6);
  assert.ok(report.rows.some(row => row.target === 'user_integrations' && row.enclosing === 'save'));
  assert.ok(report.rows.some(row => row.target === 'save_oauth_connection' && row.fieldNames.includes('p_access_token')));
  assert.ok(report.rows.some(row => row.kind === 'BROWSER_CREDENTIAL_WRITE_CANDIDATE'));
  assert.ok(report.rows.some(row => row.kind === 'PRIVATE_CREDENTIAL_CONSUMER_CANDIDATE'));
  assert.equal(JSON.stringify(report).includes('SYNTHETIC_SOURCE_SECRET_CANARY'), false);
});
test('vault names, encryption comments and permission preferences never become automatic cutover certificates', () => {
  const report = discover('backend/src/services/integrations/fixture.ts', `// encrypted with CredentialVault
    function preference(){return db.from('user_integrations').upsert({access_token:mode});}
    async function dynamic(){await db.rpc(operation,{p_access_token:token});}`);
  assert.equal(report.rows.length, 2); assert.equal(report.vaultImports.length, 0);
  assert.ok(report.rows.every(row => row.disposition.includes('NOT_A_CONFIRMED_VULNERABILITY_OR_CUTOVER_PROOF')));
  assert.ok(report.rows.some(row => row.target === '<dynamic>'));
});
test('unrelated metadata/read statements are not invented credential writes and explicit secret responses remain visible', () => {
  const report = discover('backend/src/routes/fixture.ts', `function route(){db.from('projects').update({name:'safe'});
    db.from('user_integrations').select('metadata');res.json({hasSecret:true});res.json({access_token:token});}`);
  assert.equal(report.rows.length, 1); assert.equal(report.rows[0].kind, 'POTENTIAL_PUBLIC_SECRET_PROJECTION');
});
test('configured runtime vault imports remain visible as canonical boundary users', () => {
  const report = discover('backend/src/services/integrations/example.ts',
    `import { sealRuntimeCredential } from './credentialVaultRuntime.js';\nexport async function save(){return sealRuntimeCredential(owner,binding,secret);}`);
  assert.deepEqual(report.vaultImports, ['backend/src/services/integrations/example.ts']);
});
