import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {syncBuiltinESMExports} from 'node:module';
import type {IncomingMessage} from 'node:http';
import {NextRequest} from 'next/server';
import {GET as browserView} from '../app/api/browser-view/route';
import {GET as imageFetch} from '../app/api/image-fetch/route';

// Exercise the actual routes and pinned transport. Only the DNS/socket boundary
// is replaced, rather than bypassing URL policy by mocking global fetch.
function transport(t:TestContext,upstream:()=>Promise<Response>){
  t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);
  t.mock.method(https,'request',((_url:unknown,options:any,callback:(response:IncomingMessage)=>void)=>{
    assert.equal(options.agent,false);assert.equal(options.headers['Accept-Encoding'],'identity');assert.equal(typeof options.lookup,'function');
    const request=new EventEmitter() as EventEmitter & {end:()=>void};
    request.end=()=>{void upstream().then(async response=>{
      const headers=Object.fromEntries(response.headers.entries());
      callback(Object.assign(Readable.from([Buffer.from(await response.arrayBuffer())]),{statusCode:response.status,headers}) as IncomingMessage);
    }).catch(error=>request.emit('error',error));};return request;
  }) as typeof https.request);
  syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
}

test('all browser HTML branches retain opaque response isolation and escaped error reflection',async t=>{
  let mode='html';
  transport(t,async()=>{
    if(mode==='error')throw new Error('PRIVATE_UPSTREAM_CANARY');
    return new Response('<html><head></head><body><script>UNTRUSTED_SCRIPT</script></body></html>',{status:mode==='status'?404:200,headers:{'Content-Type':'text/html'}});
  });
  const request=(target?:string)=>new NextRequest('http://example.invalid/api/browser-view'+(target?'?target='+encodeURIComponent(target):''));
  const initial=await browserView(request());assert.equal(initial.status,200);assert.ok(initial.headers.get('content-security-policy')?.includes('sandbox allow-scripts'));
  const html=await browserView(request('https://upstream.example/'));assert.ok((await html.text()).includes('UNTRUSTED_SCRIPT'));
  assert.equal(html.headers.get('content-security-policy')?.split(';')[0],'sandbox allow-scripts allow-forms allow-popups');
  for(mode of ['error','status']){
    const response=await browserView(request('https://upstream.example/"<script>REFLECTION_CANARY</script>'));
    assert.equal(response.status,200);assert.ok(response.headers.get('content-security-policy')?.startsWith('sandbox'));
    const body=await response.text();assert.ok(!body.includes('<script>REFLECTION_CANARY</script>'));assert.ok(body.includes('&lt;script&gt;REFLECTION_CANARY&lt;/script&gt;'));assert.ok(!body.includes('PRIVATE_UPSTREAM_CANARY'));
  }
});

test('image proxy retains actual image bytes but refuses HTML and isolates active SVG with fixed safe failures',async t=>{
  const bytes=new Uint8Array([1,2,3,4]);let type='image/png',outage=false;
  transport(t,async()=>{if(outage)throw new Error('PRIVATE_IMAGE_CANARY');return new Response(bytes,{headers:{'Content-Type':type}});});
  const request=new Request('http://example.invalid/api/image-fetch?url=https%3A%2F%2Fupstream.example%2Fimage');
  for(type of ['image/png','image/jpeg','image/svg+xml']){
    const response=await imageFetch(request);assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
    assert.equal(response.headers.get('content-type'),type);assert.ok(response.headers.get('content-security-policy')?.startsWith('sandbox;'));assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  }
  for(type of ['text/html','application/xhtml+xml','application/javascript']){
    const response=await imageFetch(request);assert.equal(response.status,415);assert.ok((await response.json()).error.includes('not an image'));
  }
  outage=true;const failed=await imageFetch(request);assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('PRIVATE_IMAGE_CANARY'));
});

test('actual proxy routes deny private destinations before a socket is opened',async t=>{
  let opens=0;transport(t,async()=>{opens++;return new Response('must not send');});
  for(const target of ['https://127.0.0.1','https://169.254.169.254','https://[::ffff:127.0.0.1]','https://2130706433','file:///etc/passwd']){
    const image=await imageFetch(new Request('http://example.invalid/api/image-fetch?url='+encodeURIComponent(target)));
    assert.equal(image.status,400);
    const browser=await browserView(new NextRequest('http://example.invalid/api/browser-view?target='+encodeURIComponent(target)));
    assert.ok((await browser.text()).includes('Browser fetch failed'));
    assert.ok(browser.headers.get('content-security-policy')?.startsWith('sandbox'));
  }assert.equal(opens,0);
});
