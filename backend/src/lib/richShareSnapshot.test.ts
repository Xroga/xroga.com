import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRichShare } from './richShareSnapshot.js';
import { buildNativeOpenUiShare, NATIVE_SHARE_PREFIX, readNativeOpenUiShare } from '../ai/nativeOpenUiShare.js';

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
  const sources = [{ title: 'Primary evidence', url: 'https://example.com/evidence', siteName: 'Primary publisher', publishedAt: '2026-11-08' }];
  const snapshot = buildNativeOpenUiShare(text, '', sources);
  assert.ok(snapshot);
  assert.deepEqual(projectRichShare(snapshot), { response: text, richResponse: snapshot });
  assert.deepEqual(readNativeOpenUiShare(snapshot)?.sources, sources);
  assert.equal(buildNativeOpenUiShare(text, ''), undefined);
  assert.equal(buildNativeOpenUiShare(text, '', [{ title: 'Unsafe', url: 'javascript:alert(1)' }]), undefined);
});

test('broken native share programs preserve readable text without exposing the internal envelope', () => {
  const text = 'Keep the verified table explanation.';
  const internal = 'root = Col([UnknownInternalWidget()])';
  const snapshot = NATIVE_SHARE_PREFIX + JSON.stringify({ format: 'xroga-openui-v1', text: text + '\n' + internal, program: internal, sources: [] });
  assert.equal(readNativeOpenUiShare(snapshot), undefined);
  assert.deepEqual(projectRichShare(snapshot), { response: text, richUnavailable: true });
  assert.deepEqual(projectRichShare(NATIVE_SHARE_PREFIX + '{'), { response: 'The shared answer has no readable text.', richUnavailable: true });
  assert.deepEqual(projectRichShare('{"result":42}'), { response: '{"result":42}' });
});

test('the captured architecture share projects the full prose with the diagram and table intact', () => {
  // Redacted test answer from the authenticated canary. Retain the model's
  // diagram shape, four edges, table and source-independent validation.
  const text = "A read-only web app has three roles: the browser renders the interface and sends requests; the API receives each request, applies authorization and query logic, and returns data; the database stores the data and answers read queries. The request travels browser → API → database, and the response travels back database → API → browser. The browser never talks to the database directly, and the API is the only component that holds database credentials.\n\nRead-only request and response path\n\nThe browser sends a read request to the API, which queries the database; rows return to the API, which sends the response back to the browser. The browser never contacts the database directly.\n\n- Browser → API: Request (read)\n\n- API → Database: Query\n\n- Database → API: Rows\n\n- API → Browser: Response (data)\n\n| Component | Role in a read-only app |\n| --- | --- |\n| Browser | Renders the interface and sends read requests to the API; holds no database credentials. |\n| API | Receives requests, applies authorization and query logic, and returns data to the browser. |\n| Database | Stores the data and serves read queries issued by the API. |\n\nTakeaway: the API is the single controlled gateway because the browser only asks, the database only answers, and the API decides what may be read.";
  const program = [
    "root = Col([flow, comps, takeaway])",
    "flow = Diagram(\"Read-only request and response path\", [{id: \"browser\", label: \"Browser\", level: 0, detail: \"Renders UI, sends read request\", tone: \"info\", icon: \"monitor\"}, {id: \"api\", label: \"API\", level: 1, detail: \"Authorizes, queries, shapes response\", tone: \"purple\", icon: \"server\"}, {id: \"db\", label: \"Database\", level: 2, detail: \"Stores data, answers reads\", tone: \"success\", icon: \"database\"}], [{from: \"browser\", to: \"api\", label: \"Request (read)\"}, {from: \"api\", to: \"db\", label: \"Query\"}, {from: \"db\", to: \"api\", label: \"Rows\"}, {from: \"api\", to: \"browser\", label: \"Response (data)\"}], \"The browser sends a read request to the API, which queries the database; rows return to the API, which sends the response back to the browser. The browser never contacts the database directly.\")",
    "comps = Table([\"Component\", \"Role in a read-only app\"], [[\"Browser\", \"Renders the interface and sends read requests to the API; holds no database credentials.\"], [\"API\", \"Receives requests, applies authorization and query logic, and returns data to the browser.\"], [\"Database\", \"Stores the data and serves read queries issued by the API.\"]])",
    "takeaway = Text(\"Takeaway: the API is the single controlled gateway because the browser only asks, the database only answers, and the API decides what may be read.\", \"md\", \"semibold\")",
  ].join('\n');
  const snapshot = buildNativeOpenUiShare(text, program);
  assert.ok(snapshot);
  assert.deepEqual(projectRichShare(snapshot), { response: text, richResponse: snapshot });
  assert.equal(readNativeOpenUiShare(snapshot)?.program, program);
});
