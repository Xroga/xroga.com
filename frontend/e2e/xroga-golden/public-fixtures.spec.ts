import { test, expect } from '@playwright/test';

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
