import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeAudit } from './dependency-advisories.mjs';

test('advisory evidence keeps critical paths and unresolved fixes without marking them passing', () => {
  const result = summarizeAudit({auditReportVersion:2,metadata:{vulnerabilities:{critical:1}},vulnerabilities:{fixture:{severity:'critical',isDirect:false,range:'<2',nodes:['node_modules/fixture'],via:[{title:'Synthetic advisory',url:'https://example.invalid/advisory',severity:'critical',range:'<2'}],effects:['consumer'],fixAvailable:false}}}, {packages:{'node_modules/fixture':{version:'1.0.0'}}});
  assert.equal(result.findings[0].installed[0].version,'1.0.0');
  assert.equal(result.findings[0].fixAvailable,false);
  assert.equal(result.findings[0].exposure,'REQUIRES_SEMANTIC_RUNTIME_REVIEW_NOT_WAIVED');
});
test('missing audit results fail closed rather than claiming zero vulnerabilities', () => {
  assert.throws(() => summarizeAudit({error:{code:'NETWORK'}},{packages:{}}));
});
