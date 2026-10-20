import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

test('real proxy responses isolate untrusted scripts from authenticated cookies storage parents and private files',async({browser})=>{
  test.setTimeout(120000);
  expect(process.env.CI).toBe('true');expect(process.env.XB01_DISPOSABLE_SUPABASE).toBe('1');
  expect(process.env.SUPABASE_URL).toBe('http://127.0.0.1:54321');expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(process.env.SUPABASE_URL);
  expect(process.env.E2E_BACKEND_URL).toBe('http://127.0.0.1:4000');
  const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3000'}),ids:string[]=[],nonce=randomUUID(),canary=`SYNTHETIC_ORIGIN_${randomUUID()}`,key=`proxy-canary-${nonce}`,password=`Test!${randomUUID()}aA9`;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh6kAAAAASUVORK5CYII=','base64');
  let privatePath='';
  const fixture=createServer((req,res)=>{
    if(req.url==='/png'){res.writeHead(200,{'Content-Type':'image/png'});res.end(png);return;}
    if(req.url==='/svg'){
      res.writeHead(200,{'Content-Type':'image/svg+xml'});
      res.end('<svg xmlns="http://www.w3.org/2000/svg"><script>document.documentElement.setAttribute("data-script-ran","yes")</script><text>SAFE_SVG_MARKER</text></svg>');return;
    }
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(`<!doctype html><html><head></head><body><h1>UNTRUSTED_FIXTURE</h1><script>
      (async()=>{
        const result={nonce:${JSON.stringify(nonce)},executed:true,storage:false,cookie:false,parent:false,privateBytes:false};
        try{result.storage=localStorage.getItem(${JSON.stringify(key)})===${JSON.stringify(canary)};}catch{}
        try{result.cookie=document.cookie.includes(${JSON.stringify(canary)});}catch{}
        try{result.parent=parent.localStorage.getItem(${JSON.stringify(key)})===${JSON.stringify(canary)};}catch{}
        try{const r=await fetch(${JSON.stringify('http://127.0.0.1:3000'+privatePath)},{credentials:'include'});result.privateBytes=(await r.text()).includes('OWN_PRIVATE_PROXY_CANARY');}catch{}
        parent.postMessage(result,'*');
      })();
    </script></body></html>`);
  });
  try{
    const email=`proxy-origin-${nonce}@example.invalid`;
    for(const address of [email,`proxy-foreign-${nonce}@example.invalid`]){
      const created=await admin.auth.admin.createUser({email:address,password,email_confirm:true});expect(created.error).toBeNull();expect(created.data.user).toBeTruthy();ids.push(created.data.user!.id);
    }
    const projects=await admin.from('projects').insert(ids.map(user_id=>({user_id,name:'Proxy isolation fixture',type:'app',status:'in_progress'}))).select('id,user_id');expect(projects.error).toBeNull();expect(projects.data).toHaveLength(2);
    const ownProject=projects.data!.find(p=>p.user_id===ids[0])!.id,foreignProject=projects.data!.find(p=>p.user_id===ids[1])!.id;
    const files=await admin.from('project_files').insert([{project_id:ownProject,file_name:'owner.txt',content:'OWN_PRIVATE_PROXY_CANARY'},{project_id:foreignProject,file_name:'foreign.txt',content:'FOREIGN_PRIVATE_PROXY_CANARY'}]).select('id,project_id');expect(files.error).toBeNull();expect(files.data).toHaveLength(2);
    privatePath=`/api/private-files/${ownProject}/${files.data!.find(f=>f.project_id===ownProject)!.id}`;
    const foreignPath=`/api/private-files/${foreignProject}/${files.data!.find(f=>f.project_id===foreignProject)!.id}`;
    const session=createServerClient(process.env.SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{
      getAll:async()=>context.cookies(),
      setAll:async cookies=>{await context.addCookies(cookies.map(({name,value,options})=>({name,value,domain:'127.0.0.1',path:options.path??'/',secure:false,httpOnly:options.httpOnly??false,sameSite:'Lax' as const,...(options.maxAge===0?{expires:1}:{})})));},
    }});
    expect((await session.auth.signInWithPassword({email,password})).error).toBeNull();
    const own=await context.request.get(privatePath);expect(own.status()).toBe(200);expect(await own.text()).toBe('OWN_PRIVATE_PROXY_CANARY');
    const foreign=await context.request.get(foreignPath);expect(foreign.status()).toBe(404);expect(await foreign.text()).not.toContain('FOREIGN_PRIVATE_PROXY_CANARY');
    await new Promise<void>(resolve=>fixture.listen(0,'127.0.0.1',resolve));const address=fixture.address();expect(address&&typeof address!=='string').toBeTruthy();
    const upstream=`http://127.0.0.1:${(address as {port:number}).port}`;
    const page=await context.newPage();await page.goto('/api/session',{waitUntil:'load'});
    await page.evaluate(({key,canary})=>{localStorage.setItem(key,canary);document.cookie=`xroga_origin_canary=${canary}; Path=/; SameSite=Lax`;},{key,canary});
    const proxyPath=`/api/browser-view?target=${encodeURIComponent(upstream+'/html')}`;
    const response=await context.request.get(proxyPath);expect(response.status()).toBe(200);expect(response.headers()['content-security-policy']).toContain('sandbox allow-scripts');
    await page.evaluate(({url,nonce})=>{
      const iframe=document.createElement('iframe');iframe.id='untrusted-proxy';iframe.sandbox.add('allow-scripts','allow-same-origin','allow-forms','allow-popups');
      window.addEventListener('message',event=>{if(event.source===iframe.contentWindow&&event.data?.nonce===nonce)(window as unknown as {proxyProbe:unknown}).proxyProbe={...event.data,messageOrigin:event.origin};});
      iframe.src=url;document.body.appendChild(iframe);
    },{url:proxyPath,nonce});
    await expect(page.frameLocator('#untrusted-proxy').getByRole('heading',{name:'UNTRUSTED_FIXTURE'})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {proxyProbe?:unknown}).proxyProbe),{timeout:15000}).toEqual({nonce,executed:true,storage:false,cookie:false,parent:false,privateBytes:false,messageOrigin:'null'});
    expect(await page.evaluate(({key})=>localStorage.getItem(key),{key})).toBe(canary);
    const image=await context.request.get(`/api/image-fetch?url=${encodeURIComponent(upstream+'/png')}`);expect(image.status()).toBe(200);expect(await image.body()).toEqual(png);expect(image.headers()['x-content-type-options']).toBe('nosniff');
    const rejected=await context.request.get(`/api/image-fetch?url=${encodeURIComponent(upstream+'/html')}`);expect(rejected.status()).toBe(415);expect(await rejected.text()).not.toContain('UNTRUSTED_FIXTURE');
    const svgPage=await context.newPage();const svg=await svgPage.goto(`/api/image-fetch?url=${encodeURIComponent(upstream+'/svg')}`,{waitUntil:'load'});expect(svg?.status()).toBe(200);expect(svg?.headers()['content-security-policy']).toContain('sandbox;');
    await expect(svgPage.locator('svg text')).toHaveText('SAFE_SVG_MARKER');expect(await svgPage.locator('svg').getAttribute('data-script-ran')).toBeNull();
    const reflected=await context.request.get(`/api/browser-view?target=${encodeURIComponent('unsupported:<script>ORIGIN_REFLECTION_CANARY</script>')}`);expect(reflected.headers()['content-security-policy']).toContain('sandbox');expect(await reflected.text()).not.toContain('<script>ORIGIN_REFLECTION_CANARY</script>');
    await mkdir('test-results',{recursive:true});await writeFile('test-results/proxy-origin-evidence.json',JSON.stringify({sourceSha:process.env.XB01_TEST_SOURCE_SHA??process.env.EXPECTED_RELEASE_SHA,disposableOnly:true,authenticatedOwnFile:true,foreignFileDenied:true,untrustedScriptExecutesInOpaqueOrigin:true,appCookieStorageParentAndPrivateFileDenied:true,rasterBytesRetained:true,htmlImageRefused:true,svgScriptDenied:true,escapedErrorReflection:true,externalProviderCalled:false,command010EgressVerified:false},null,2));
  }finally{
    await context.close();await new Promise<void>((resolve,reject)=>fixture.close(error=>error&&(error as NodeJS.ErrnoException).code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve()));
    for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
