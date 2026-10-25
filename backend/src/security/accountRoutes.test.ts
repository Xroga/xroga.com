/** Router admission only. Real database/auth assertions live in the disposable integration suite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import notifications from '../routes/notifications.js';
import profile from '../routes/profile.js';
import type { AuthRequest } from '../middleware/auth.js';

test('account routers reject legacy userId/body context without server-issued authority',async()=>{
  const app=express();app.use(express.json());
  app.use((req:AuthRequest,_res,next)=>{req.userId='11111111-1111-4111-8111-111111111111';req.tenantContext=req.body?.tenantContext;next();});
  app.use('/notifications',notifications);app.use('/profile',profile);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for(const [path,method] of [['/notifications','GET'],['/notifications/fake/read','PATCH'],['/notifications/fake','DELETE'],['/profile','GET'],['/profile','PATCH'],['/profile','DELETE'],['/profile/activity','GET']]) {
      const response=await fetch(`${origin}${path}`,{method,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({tenantContext:{userId:'11111111-1111-4111-8111-111111111111'},confirm:'DELETE'})})});
      assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'Sign in again and retry.'});
    }
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
