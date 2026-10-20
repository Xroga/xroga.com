import assert from 'node:assert/strict';
import test from 'node:test';
import {browserProxyHeaders,imageProxyHeaders} from './untrustedProxyResponsePolicy.mjs';

test('Next header composition preserves exact proxy sandboxes and leaves all other application routes strict',async()=>{
  const config=(await import('../../next.config.mjs')).default;
  const rules=await config.headers!();assert.ok(rules);
  const catchAll=rules.find(rule=>rule.source.startsWith('/((?!'));assert.ok(catchAll);
  const matcher=new RegExp('^'+catchAll.source+'$');
  for(const[path,policy]of [['/api/browser-view',browserProxyHeaders],['/api/image-fetch',imageProxyHeaders]] as const){
    assert.equal(matcher.test(path),false);assert.equal(matcher.test(path+'/'),false);
    const exact=rules.filter(rule=>rule.source===path);assert.equal(exact.length,1);
    const actual=new Map(exact[0].headers.map(header=>[header.key.toLowerCase(),header.value]));
    assert.equal(actual.size,exact[0].headers.length,'No duplicate header keys or reliance on override order');
    for(const[key,value]of Object.entries(policy))assert.equal(actual.get(key.toLowerCase()),value);
    assert.equal(actual.get('strict-transport-security'),'max-age=31536000; includeSubDomains');
  }
  for(const path of ['/api/session','/api/private-files/project/file','/api/browser-viewer','/api/image-fetch-other','/os-preview/founder','/workspace'])assert.equal(matcher.test(path),true,path);
  const normal=new Map(catchAll.headers.map(header=>[header.key.toLowerCase(),header.value]));assert.equal(normal.get('x-frame-options'),'DENY');assert.ok(normal.get('content-security-policy')?.includes("frame-ancestors 'none'"));assert.ok(!normal.get('content-security-policy')?.includes('sandbox allow-scripts'));
});
