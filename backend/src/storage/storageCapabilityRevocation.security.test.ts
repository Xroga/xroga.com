import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, BUCKET } from './testing/harness.js';

test('single-upload capability is not returned after ownership changes while signing',async t=>{
  const h=harness(),sign=h.store.presignPut.bind(h.store);
  t.mock.method(h.store,'presignPut',async(...args:Parameters<typeof sign>)=>{
    const capability=await sign(...args);h.repo.projects.set(h.aliceProject,h.bob.userId);return capability;
  });
  await assert.rejects(h.svc.initiateUpload(h.alice,{projectId:h.aliceProject,filename:'owned.txt',contentType:'text/plain',size:10}),{code:'NOT_FOUND'});
});

test('multipart capabilities are not returned after ownership changes while signing',async t=>{
  const h=harness({policy:{singlePutMaxBytes:1}});
  const upload=await h.svc.initiateUpload(h.alice,{projectId:h.aliceProject,filename:'owned.txt',contentType:'text/plain',size:2});
  assert.equal(upload.mode,'multipart');const sign=h.store.presignPart.bind(h.store);
  t.mock.method(h.store,'presignPart',async(...args:Parameters<typeof sign>)=>{
    const capability=await sign(...args);h.repo.projects.set(h.aliceProject,h.bob.userId);return capability;
  });
  await assert.rejects(h.svc.signUploadParts(h.alice,upload.objectId,[1]),{code:'NOT_FOUND'});
});

test('revoked multipart creation aborts only its own temporary upload',async t=>{
  const h=harness({policy:{singlePutMaxBytes:1}}),create=h.store.createMultipart.bind(h.store),abort=h.store.abortMultipart.bind(h.store);
  let created:string|undefined;const aborted:string[]=[];
  t.mock.method(h.store,'createMultipart',async(...args:Parameters<typeof create>)=>{
    const result=await create(...args);created=result.uploadId;h.repo.projects.set(h.aliceProject,h.bob.userId);return result;
  });
  t.mock.method(h.store,'abortMultipart',async(...args:Parameters<typeof abort>)=>{aborted.push(args[2]);return abort(...args);});
  await assert.rejects(h.svc.initiateUpload(h.alice,{projectId:h.aliceProject,filename:'owned.txt',contentType:'text/plain',size:2}),{code:'NOT_FOUND'});
  assert.deepEqual(aborted,[created]);
});

test('multipart completion cannot dispatch after ownership is revoked during provider part validation',async t=>{
  const h=harness({policy:{singlePutMaxBytes:1}});
  const upload=await h.svc.initiateUpload(h.alice,{projectId:h.aliceProject,filename:'owned.txt',contentType:'text/plain',size:2});
  const object=(await h.repo.getObject(upload.objectId))!;
  const part=await h.store.uploadPart(BUCKET,object.objectKey,object.multipartUploadId!,1,Buffer.from('ok'));
  const list=h.store.listParts.bind(h.store),complete=h.store.completeMultipart.bind(h.store);let completions=0;
  t.mock.method(h.store,'listParts',async(...args:Parameters<typeof list>)=>{const result=await list(...args);h.repo.projects.set(h.aliceProject,h.bob.userId);return result;});
  t.mock.method(h.store,'completeMultipart',async(...args:Parameters<typeof complete>)=>{completions++;return complete(...args);});
  await assert.rejects(h.svc.completeUpload(h.alice,object.id,{parts:[{partNumber:1,etag:part.etag}]}),{code:'NOT_FOUND'});
  assert.equal(completions,0);
});

for(const change of ['owner','deleted'] as const){
  test(`download capability is not returned after ${change} changes while signing`,async t=>{
    const h=harness();
    const object=await h.svc.putServerObject(h.alice,{projectId:h.aliceProject,objectClass:'artifact',filename:'owned.txt',contentType:'text/plain',body:Buffer.from('Owned fixture')});
    const sign=h.store.presignGet.bind(h.store);
    t.mock.method(h.store,'presignGet',async(...args:Parameters<typeof sign>)=>{
      const capability=await sign(...args);
      if(change==='owner')h.repo.projects.set(h.aliceProject,h.bob.userId);
      else h.repo.objects.set(object.id,{...h.repo.objects.get(object.id)!,state:'DELETED'});
      return capability;
    });
    await assert.rejects(h.svc.getDownload(h.alice,object.id));
  });
}
