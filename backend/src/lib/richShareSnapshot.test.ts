import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRichShare } from './richShareSnapshot.js';

test('old clients receive full text and new clients can independently validate the read-only snapshot', () => {
  const snapshot='XROGA_RESPONSE_V2\n'+JSON.stringify({version:2,text:'Full answer with tenant_id.',document:{version:2,nodes:[{kind:'prose',text:'Full answer with tenant_id.'}]}});
  assert.deepEqual(projectRichShare(snapshot),{response:'Full answer with tenant_id.',richResponse:snapshot});
});

test('ordinary JSON answers, unknown versions and malformed or oversized values stay literal', () => {
  for (const text of ['Plain text.', '{"version":2,"text":"Normal code example"}', 'XROGA_RESPONSE_V2\n{', 'XROGA_RESPONSE_V2\n'+JSON.stringify({version:3,text:'Future format'}), 'XROGA_RESPONSE_V2\n'+'x'.repeat(100_000)]) {
    assert.deepEqual(projectRichShare(text),{response:text});
  }
});
