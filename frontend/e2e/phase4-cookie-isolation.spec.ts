import { test, expect } from '@playwright/test';
import { authCookieOptions } from '../src/lib/supabase/authCookiePolicy';

// Only synthetic documents and cookie values. This tests the browser's actual
// cookie-domain enforcement, not a Supabase login or provider operation.
for (const protectedCookie of [false,true]) {
  test(`synthetic Preview cookie injection ${protectedCookie?'cannot alter hosted Auth':'reproduces the unsafe unprefixed control'}`,async({browser})=>{
    const context=await browser.newContext();
    try {
      await context.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.protocol!=='https:'||!['xroga.test','preview.xroga.test'].includes(u.hostname))return route.abort();
        return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Synthetic origin-isolation fixture</title>'});
      });
      const main=await context.newPage(),preview=await context.newPage();
      const options=authCookieOptions('nzenxdfumxrnsmybazmo');
      const name=protectedCookie?options.name!:'sb-synthetic-control-auth-token';
      await main.goto('https://xroga.test/');await preview.goto('https://preview.xroga.test/');
      await main.evaluate(name=>{document.cookie=`${name}=OWNED_SYNTHETIC; Secure; Path=/; SameSite=Lax`;},name);
      expect((await context.cookies('https://xroga.test/')).find(c=>c.name===name)?.value).toBe('OWNED_SYNTHETIC');
      await preview.evaluate(name=>{document.cookie=`${name}=FOREIGN_SYNTHETIC; Domain=xroga.test; Secure; Path=/`;},name);
      const shared=(await context.cookies('https://xroga.test/')).filter(c=>c.name===name&&c.domain.startsWith('.'));
      expect(shared).toHaveLength(protectedCookie?0:1);
      await preview.evaluate(()=>localStorage.setItem('ordinary-preview-state','preserved'));
      expect(await preview.evaluate(()=>localStorage.getItem('ordinary-preview-state'))).toBe('preserved');
    }finally{await context.close();}
  });
}
