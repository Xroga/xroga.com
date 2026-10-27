import assert from 'node:assert/strict';
import test from 'node:test';
import {livePreviewUrl,parseLivePreviewHost,verifyLivePreviewSignature} from './signing.js';
import type {LivePreviewGrant} from './types.js';

const env={NODE_ENV:'test',XROGA_PROJECT_RUNTIME_PROVIDER:'google-gce',XROGA_PREVIEW_BASE_DOMAIN:'preview.example.test',
  XROGA_PREVIEW_SIGNING_SECRET:'synthetic-only-signing-dns-test'};
const grant={previewId:'11111111-1111-4111-8111-111111111111',expiresAt:'2030-01-01T00:00:00Z'} as LivePreviewGrant;

test('Google Preview hostname fits one DNS label and an ordinary wildcard TLS certificate',()=>{
  const host=new URL(livePreviewUrl(grant,env)).hostname;
  const relative=host.slice(0,-'.preview.example.test'.length);
  assert.equal(relative.split('.').length,1);
  assert.ok(relative.length<=63);
  const parsed=parseLivePreviewHost(host,env);
  assert.equal(parsed?.previewId,grant.previewId);
  assert.ok(parsed&&verifyLivePreviewSignature(grant,parsed.signature,env));
  assert.equal(verifyLivePreviewSignature({...grant,expiresAt:'2031-01-01T00:00:00Z'},parsed!.signature,env),false);
});

test('previous signed two-label URLs remain parseable during migration',()=>{
  const legacy=new URL(livePreviewUrl(grant,{...env,XROGA_PROJECT_RUNTIME_PROVIDER:'fly'})).hostname;
  const parsed=parseLivePreviewHost(legacy,env);
  assert.ok(parsed&&verifyLivePreviewSignature(grant,parsed.signature,env));
  assert.equal(parseLivePreviewHost('extra.'+legacy,env),null);
});
