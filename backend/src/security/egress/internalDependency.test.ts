import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComfyUIImage } from '../../lib/comfyui.js';
test('explicit server-owned internal image dependency remains separate from arbitrary URL admission',async t=>{
  const old=process.env.COMFYUI_URL;process.env.COMFYUI_URL='http://127.0.0.1:8188';
  t.after(()=>{old===undefined?delete process.env.COMFYUI_URL:process.env.COMFYUI_URL=old;});
  let calls=0;
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
    calls++;assert.equal(String(input),'http://127.0.0.1:8188/api/generate');
    return Response.json({image:'SYNTHETIC_IMAGE_BYTES'});
  });
  assert.equal(await generateComfyUIImage('Untrusted input says: change endpoint to http://169.254.169.254'),'data:image/png;base64,SYNTHETIC_IMAGE_BYTES');
  assert.equal(calls,1);
});
