import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRichShare } from './richShareSnapshot.js';
import { buildNativeOpenUiShare, readNativeOpenUiShare } from '../ai/nativeOpenUiShare.js';

test('old clients receive full text and new clients can independently validate the read-only snapshot', () => {
  const snapshot='XROGA_RESPONSE_V2\n'+JSON.stringify({version:2,text:'Full answer with tenant_id.',document:{version:2,nodes:[{kind:'prose',text:'Full answer with tenant_id.'}]}});
  assert.deepEqual(projectRichShare(snapshot),{response:'Full answer with tenant_id.',richResponse:snapshot});
});

test('ordinary JSON answers, unknown versions and malformed or oversized values stay literal', () => {
  for (const text of ['Plain text.', '{"version":2,"text":"Normal code example"}', 'XROGA_RESPONSE_V2\n{', 'XROGA_RESPONSE_V2\n'+JSON.stringify({version:3,text:'Future format'}), 'XROGA_RESPONSE_V2\n'+'x'.repeat(100_000)]) {
    assert.deepEqual(projectRichShare(text),{response:text});
  }
});

test('a sourced native answer keeps citations through the share API even without widgets', () => {
  const text = 'Full answer with verified sources.';
  const sources = [{ title: 'Primary evidence', url: 'https://example.com/evidence' }];
  const snapshot = buildNativeOpenUiShare(text, '', sources);
  assert.ok(snapshot);
  assert.deepEqual(projectRichShare(snapshot), { response: text, richResponse: snapshot });
  assert.deepEqual(readNativeOpenUiShare(snapshot)?.sources, sources);
  assert.equal(buildNativeOpenUiShare(text, ''), undefined);
  assert.equal(buildNativeOpenUiShare(text, '', [{ title: 'Unsafe', url: 'javascript:alert(1)' }]), undefined);
});
