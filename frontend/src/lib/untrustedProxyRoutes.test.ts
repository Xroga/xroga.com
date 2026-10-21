import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server';
import {GET as browserView} from '../app/api/browser-view/route';
import {GET as imageFetch} from '../app/api/image-fetch/route';

test('all browser HTML branches retain opaque response isolation and escaped error reflection',async t=>{
  let mode='html';
  t.mock.method(globalThis,'fetch',async()=>{
    if(mode==='error')throw new Error('PRIVATE_UPSTREAM_CANARY');
    return new Response('<html><head></head><body><script>UNTRUSTED_SCRIPT</script></body></html>',{status:mode==='status'?404:200,headers:{'Content-Type':'text/html'}});
  });
  const request=(target?:string)=>new NextRequest('http://example.invalid/api/browser-view'+(target?'?target='+encodeURIComponent(target):''));
  const initial=await browserView(request());assert.equal(initial.status,200);assert.ok(initial.headers.get('content-security-policy')?.includes('sandbox allow-scripts'));
  const html=await browserView(request('https://upstream.invalid/'));assert.ok((await html.text()).includes('UNTRUSTED_SCRIPT'));
  assert.equal(html.headers.get('content-security-policy')?.split(';')[0],'sandbox allow-scripts allow-forms allow-popups');
  for(mode of ['error','status']){
    const response=await browserView(request('https://upstream.invalid/"<script>REFLECTION_CANARY</script>'));
    assert.equal(response.status,200);assert.ok(response.headers.get('content-security-policy')?.startsWith('sandbox'));
    const body=await response.text();assert.ok(!body.includes('<script>REFLECTION_CANARY</script>'));assert.ok(body.includes('&lt;script&gt;REFLECTION_CANARY&lt;/script&gt;'));assert.ok(!body.includes('PRIVATE_UPSTREAM_CANARY'));
  }
});

test('image proxy retains actual image bytes but refuses HTML and isolates active SVG with fixed safe failures',async t=>{
  const bytes=new Uint8Array([1,2,3,4]);let type='image/png',outage=false;
  t.mock.method(globalThis,'fetch',async()=>{if(outage)throw new Error('PRIVATE_IMAGE_CANARY');return new Response(bytes,{headers:{'Content-Type':type}});});
  const request=new Request('http://example.invalid/api/image-fetch?url=https%3A%2F%2Fupstream.invalid%2Fimage');
  for(type of ['image/png','image/jpeg','image/svg+xml']){
    const response=await imageFetch(request);assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
    assert.equal(response.headers.get('content-type'),type);assert.ok(response.headers.get('content-security-policy')?.startsWith('sandbox;'));assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  }
  for(type of ['text/html','application/xhtml+xml','application/javascript']){
    const response=await imageFetch(request);assert.equal(response.status,415);assert.ok((await response.json()).error.includes('not an image'));
  }
  outage=true;const failed=await imageFetch(request);assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('PRIVATE_IMAGE_CANARY'));
});
