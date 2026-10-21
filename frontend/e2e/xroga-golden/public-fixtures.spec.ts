import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Actual guest UI with intercepted fixture transport. Not authenticated-chat/provider proof.
test.beforeEach(async ({page,baseURL})=>{
  const origin=new URL(baseURL??'http://127.0.0.1:3000');
  if(!['127.0.0.1','localhost'].includes(origin.hostname))throw new Error('Golden fixture browser tests refuse non-loopback application URLs');
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/guest/chat'){
      expect(['127.0.0.1','localhost']).toContain(url.hostname);
      const headers={'access-control-allow-origin':origin.origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,accept'};
      if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
      const body=route.request().postDataJSON() as {message:string;guestSessionId:string};
      expect(body.message).toContain('fixture');
      if(body.message.includes('unavailable')){
        await route.fulfill({status:503,headers,json:{error:'Guest chat is temporarily unavailable. Please try again shortly.',code:'GUEST_CHAT_UNAVAILABLE'}});return;
      }
      await route.fulfill({headers,json:{response:'DEMO fixture reply. No external work was performed.',guestSessionId:body.guestSessionId,guest:{limit:5,remaining:4,resetAt:'2099-01-01T00:00:00Z'}}});return;
    }
    if(!['127.0.0.1','localhost'].includes(url.hostname)){await route.abort('blockedbyclient');return;}
    // No billing, external connections or effectful operational endpoints may be used by this fixture.
    if(/\/api\/(?:billing|publish|integrations|admin|operations)/.test(url.pathname)&&route.request().method()!=='GET')throw new Error('Unexpected consequential fixture request');
    await route.continue();
  });
});

test('GJ guest rendering boundary sends fixture input, shows its label and restores the local conversation',async({page})=>{
  await page.goto('/workspace',{waitUntil:'domcontentloaded'});
  const input=page.getByRole('textbox',{name:'Message Xroga'});
  await expect(input).toBeVisible();await input.fill('Explain idempotency for this fixture');await input.press('Enter');
  await expect(page.getByText('DEMO fixture reply. No external work was performed.',{exact:true}).first()).toBeVisible({timeout:30000});
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('xroga_guest_workspace_v1'))).toContain('DEMO fixture reply');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByText('DEMO fixture reply. No external work was performed.',{exact:true}).first()).toBeVisible();
});
test('GJ private preview and RSC deny a guest without leaking founder fixture content',async({request,baseURL})=>{
  if(!['127.0.0.1','localhost'].includes(new URL(baseURL!).hostname))throw new Error('Golden denial tests require loopback');
  for(const headers of [{},{RSC:'1',Accept:'text/x-component'}]){
    const response=await request.get('/os-preview/founder',{headers,maxRedirects:5});
    if(new URL(response.url()).pathname.startsWith('/os-preview'))expect(response.status()).toBe(404);
    else expect(response.url()).toMatch(/\/auth\/login/);
    expect(await response.text()).not.toContain('Scenario & Error Lab');
  }
});
test('GJ narrow guest UI shows a truthful actionable failure rather than Coming soon',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/workspace',{waitUntil:'domcontentloaded'});
  const input=page.getByRole('textbox',{name:'Message Xroga'});await input.fill('Make the fixture temporarily unavailable');await input.press('Enter');
  await expect(page.getByText('Guest chat is temporarily unavailable. Please try again shortly.',{exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('production crypto typography loads real local normal and italic faces without a font service',async({page,baseURL})=>{
  const fonts:{url:string;status:number}[]=[];
  const payloads:Promise<string>[]=[];
  page.on('response',response=>{
    if(response.request().resourceType()==='font'){
      fonts.push({url:response.url(),status:response.status()});
      payloads.push(response.body().then(bytes=>createHash('sha256').update(bytes).digest('hex')));
    }
  });
  const response=await page.goto('/crypto',{waitUntil:'domcontentloaded'});
  expect(response?.status()).toBe(200);
  await expect(page.locator('main[data-crypto-page]')).toBeVisible();
  const faces=await page.locator('main[data-crypto-page]').evaluate(async element=>{
    const css=getComputedStyle(element);
    const ui=css.getPropertyValue('--font-manrope').trim().split(',')[0];
    const editorial=css.getPropertyValue('--font-editorial').trim().split(',')[0];
    if(!ui||!editorial)throw new Error('Actual typography variables unavailable');
    const result=[];
    for(const [family,style] of [[ui,'normal'],[editorial,'normal'],[editorial,'italic']]){
      const loaded=await document.fonts.load(`${style} 500 24px ${family}`,'Xroga');
      result.push({family,style,count:loaded.length,loaded:loaded.every(face=>face.status==='loaded'&&face.style===style)});
    }
    return result;
  });
  expect(faces).toHaveLength(3);
  for(const face of faces){expect(face.count).toBeGreaterThan(0);expect(face.loaded).toBe(true);}
  expect(new Set(faces.map(face=>face.family)).size).toBe(2);
  expect(fonts.length).toBeGreaterThanOrEqual(3);
  for(const font of fonts){
    expect(new URL(font.url).origin).toBe(new URL(baseURL!).origin);
    // Root typography already uses local TTFs; preserve it, do not require a
    // format migration merely to validate this route's three new WOFF2 assets.
    expect(new URL(font.url).pathname).toMatch(/^\/_next\/static\/media\/.+\.(?:woff2|ttf)$/);
    expect(font.status).toBe(200);
  }
  const received=await Promise.all(payloads);
  // Playwright compiles this existing suite as CommonJS. Resolve from the
  // spec directory, not the invocation cwd (root and frontend both occur in CI).
  const register=JSON.parse(readFileSync(resolve(__dirname,'../../../docs/xroga/security/CRYPTO_FONT_REGISTER.json'),'utf8')) as {fonts:{sha256:string}[]};
  for(const font of register.fonts)expect(received).toContain(font.sha256);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('main[data-crypto-page]')).toBeVisible();
});
