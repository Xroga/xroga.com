import assert from 'node:assert/strict';
import test from 'node:test';
import {browserProxyHeaders,imageProxyHeaders,escapeProxyHtml} from './untrustedProxyResponse';

test('untrusted proxy responses cannot inherit the application origin or interpolate active error HTML',()=>{
  const browser=browserProxyHeaders['content-security-policy'];
  const sandbox=browser.split(';').find(d=>d.trim().startsWith('sandbox'))!;
  assert.ok(sandbox.includes('allow-scripts'),'Legitimate browser pages still execute inside their isolated origin');
  assert.equal(sandbox.includes('allow-same-origin'),false);
  assert.equal(sandbox.includes('allow-top-navigation'),false);
  assert.equal(sandbox.includes('allow-popups-to-escape-sandbox'),false);
  assert.ok(imageProxyHeaders['Content-Security-Policy'].startsWith('sandbox;'));
  assert.ok(imageProxyHeaders['Content-Security-Policy'].includes("default-src 'none'"));
  assert.equal(imageProxyHeaders['X-Content-Type-Options'],'nosniff');
  assert.equal(escapeProxyHtml('<img src="x" onerror=\'alert(1)\'>&'),'&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
});
