import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publishChromeExtensionToStore,fetchCwsItemStatus,saveCwsCredentials} from './chromeWebStore.js';

test('CWS exact target receipts gate publish and status without leaking provider errors',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49205';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const creds={clientId:'client',clientSecret:'SECRET',refreshToken:'refresh',extensionId:'item-a',publisherId:'publisher-a'};
 const receipt={name:'publishers/publisher-a/items/item-a',itemId:'item-a'};
 let mode='ok',publishes=0,external=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin==='http://127.0.0.1:49205')return Response.json({access_token:`enc:${Buffer.from(`fixture:${JSON.stringify(creds)}`).toString('base64')}`,metadata:{}});
  external++;assert.equal(init?.redirect,'error');
  if(url.origin==='https://oauth2.googleapis.com')return Response.json(mode==='oauth'?{error:'SECRET'}:{access_token:'token'});
  assert.equal(url.origin,'https://chromewebstore.googleapis.com');
  if(mode==='transport')throw new Error('SECRET');
  if(url.pathname.endsWith(':upload')){
   assert.equal(url.pathname,'/upload/v2/publishers/publisher-a/items/item-a:upload');
   return Response.json(mode==='null'?null:mode==='empty'?{}:{...receipt,...(mode==='foreign'?{itemId:'other'}:{}),uploadState:mode==='pending'?'IN_PROGRESS':mode==='failed'?'FAILED':'SUCCEEDED'});
  }
  if(url.pathname.endsWith(':publish')){publishes++;return Response.json(mode==='bad-publish'?{error:{message:'SECRET'}}:{...receipt,state:'PENDING_REVIEW'});}
  assert.equal(url.pathname,'/v2/publishers/publisher-a/items/item-a:fetchStatus');
  return Response.json(mode==='bad-status'?{...receipt,name:'other',message:'SECRET'}:mode==='empty-status'?receipt:{...receipt,publishedItemRevisionStatus:{state:'PUBLISHED'},submittedItemRevisionStatus:{state:'PENDING_REVIEW'},takenDown:mode==='taken-down'});
 });
 for(mode of ['empty','null','foreign','pending','failed','oauth']){publishes=0;const result=await publishChromeExtensionToStore({userId:'owner',zip:Buffer.alloc(80)});assert.equal(result.submitted,false);assert.equal(publishes,0);assert.doesNotMatch(JSON.stringify(result),/SECRET/);}
 mode='ok';assert.equal((await publishChromeExtensionToStore({userId:'owner',zip:Buffer.alloc(80)})).submitted,true);
 mode='bad-publish';const partial=await publishChromeExtensionToStore({userId:'owner',zip:Buffer.alloc(80)});assert.equal(partial.ok,true);assert.equal(partial.submitted,false);assert.doesNotMatch(JSON.stringify(partial),/SECRET/);
 mode='ok';assert.equal((await fetchCwsItemStatus('owner')).status,'PENDING_REVIEW');
 mode='taken-down';assert.equal((await fetchCwsItemStatus('owner')).status,'TAKEN_DOWN');
 for(mode of ['bad-status','empty-status']){const result=await fetchCwsItemStatus('owner');assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/SECRET/);}
 mode='transport';await assert.rejects(fetchCwsItemStatus('owner'),{message:'Chrome Web Store request unavailable. Retry shortly.'});
 for(const bad of ['../other','item?token=SECRET','item%2fother','item/other']){const before=external;await assert.rejects(saveCwsCredentials('owner',{...creds,extensionId:bad}),/Invalid Chrome Web Store/);assert.equal(external,before);}
});
