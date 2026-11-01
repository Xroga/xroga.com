import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../package.json',import.meta.url));
const ts=require('typescript'),{chromium}=require('@playwright/test');

// Real Chromium, synthetic image bytes and an isolated local HTTP fixture.
// Every attempted outside request is intercepted, never sent to the Internet.
const source=readFileSync(new URL('../src/lib/imageStudioUtils.ts',import.meta.url),'utf8');
const moduleText=ts.transpileModule(source.replace("import toast from 'react-hot-toast';",'const toast={success(){},error(){}};'),
  {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let browser,server,origin,png;
before(async()=>{
  server=createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/fixture.js'){res.writeHead(200,{'content-type':'text/javascript'}).end(moduleText);return;}
    if(url.pathname==='/api/image-fetch'){
      if(url.searchParams.get('url')?.startsWith('https://public-image.test/'))res.writeHead(200,{'content-type':'image/png'}).end(png);
      else res.writeHead(403,{'content-type':'application/json'}).end('{"error":"SYNTHETIC_POLICY_DENIAL"}');
      return;
    }
    res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><title>Isolated image admission fixture</title>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  try{
    const page=await context.newPage();await page.goto(origin);
    png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=3;const ctx=canvas.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,2,3);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
  }finally{await context.close();}
});
after(async()=>{await browser?.close();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));});

async function inFixture(run){
  const context=await browser.newContext(),outside=[];
  try{
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      outside.push(url.href);
      return route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:png});
    });
    const page=await context.newPage();await page.goto(origin);
    return await run(page,outside);
  }finally{await context.close();}
}

for(const transform of [false,true])test(`a denied image proxy cannot fall through to ${transform?'direct transformed-image loading':'direct fetch'}`,async t=>{
  await inFixture(async(page,outside)=>{
    const result=await page.evaluate(async({moduleUrl,transform})=>{
      const lib=await import(moduleUrl);
      try{
        const value=transform?await lib.renderTransformedImage('https://denied-image.test/private.png',{rotation:90,flipH:false,flipV:false,aspectRatio:'free'}):await lib.imageUrlToPngBlob('https://denied-image.test/private.png');
        return{blocked:value===null};
      }catch{return{blocked:true};}
    },{moduleUrl:origin+'/fixture.js',transform});
    t.diagnostic(JSON.stringify({outsideAttempts:outside.length,blocked:result.blocked}));
    assert.equal(outside.length,0,'Server security denial must stop all direct browser network attempts');
    assert.equal(result.blocked,true);
  });
});

test('authorized proxy images, local data/blob images and transformations remain functional',async t=>{
  await inFixture(async(page,outside)=>{
    const result=await page.evaluate(async({moduleUrl,data})=>{
      const lib=await import(moduleUrl),url='https://public-image.test/owned.png';
      const direct=await lib.imageUrlToPngBlob(url),embedded=await lib.imageUrlToPngBlob(data);
      const local=URL.createObjectURL(embedded);let fromBlob;
      try{fromBlob=await lib.imageUrlToPngBlob(local);}finally{URL.revokeObjectURL(local);}
      const transformed=await lib.renderTransformedImage(url,{rotation:90,flipH:false,flipV:false,aspectRatio:'free'});
      const bitmap=await createImageBitmap(transformed);
      try{return{types:[direct.type,embedded.type,fromBlob.type,transformed.type],width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}
    },{moduleUrl:origin+'/fixture.js',data:'data:image/png;base64,'+png.toString('base64')});
    assert.deepEqual(result.types,['image/png','image/png','image/png','image/png']);assert.equal(result.width,3);assert.equal(result.height,2);assert.equal(outside.length,0);
    t.diagnostic(JSON.stringify({browser:browser.version(),sourceSha256:createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),outsideAttempts:outside.length}));
  });
});

test('local image conversion cannot introduce SVG network effects or unbounded input bodies',async()=>{
  await inFixture(async(page,outside)=>{
    const result=await page.evaluate(async moduleUrl=>{
      const lib=await import(moduleUrl);
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><script>fetch("https://svg-egress.test/script")</script><image href="https://svg-egress.test/pixel" width="2" height="3"/></svg>';
      const converted=await lib.imageUrlToPngBlob('data:image/svg+xml,'+encodeURIComponent(svg));
      const huge=URL.createObjectURL(new Blob([new Uint8Array(16*1024*1024+1)],{type:'image/png'}));let denied=false;
      try{await lib.imageUrlToPngBlob(huge);}catch{denied=true;}finally{URL.revokeObjectURL(huge);}
      return{type:converted.type,denied};
    },origin+'/fixture.js');
    assert.equal(result.type,'image/png');assert.equal(result.denied,true);assert.equal(outside.length,0);
  });
});
