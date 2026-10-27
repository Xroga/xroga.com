import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

/** Two real processes contend through an HTTP Compute fixture. This proves the
 * adapter protocol under a stale inventory, not live GCP IAM or networking. */
test('separate API processes cannot exceed one physical slot or delete the winning allocation',async()=>{
  const configuration={project:'synthetic-project',zone:'us-central1-a',
    subnet:'projects/synthetic-project/regions/us-central1/subnetworks/execution',imageName:'xroga-exec-synthetic',imageId:'12345',
    serviceAccount:'synthetic-runtime@synthetic-project.iam.gserviceaccount.com',admittedImages:['node@sha256:'+'a'.repeat(64)],maxConcurrentInstances:1};
  const machines=new Map<string,Record<string,unknown>>();const names:string[]=[];let creates=0,deletes=0,maximum=0,lists=0,posts=0;
  let releaseLists:()=>void=()=>{},releasePosts:()=>void=()=>{};
  const bothLists=new Promise<void>(resolve=>{releaseLists=resolve;});
  const bothPosts=new Promise<void>(resolve=>{releasePosts=resolve;});
  const server=createServer((req,res)=>{void(async()=>{
    const url=new URL(req.url!,'http://127.0.0.1');let value:unknown;
    if(url.pathname.includes('/global/images/'))value={id:configuration.imageId,status:'READY'};
    else if(req.method==='GET'&&url.searchParams.has('maxResults')){
      if(++lists===2)releaseLists();await bothLists;value={items:[]};
    }else if(req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      const instance=JSON.parse(body);names.push(instance.name);if(++posts===2)releasePosts();
      if(machines.has(instance.name)){res.writeHead(409).end('{}');return;}
      creates++;machines.set(instance.name,{...instance,id:'1234567',status:'RUNNING',
        networkInterfaces:[{networkIP:'10.90.0.2',subnetwork:configuration.subnet}]});
      maximum=Math.max(maximum,machines.size);value={name:'create-synthetic'};
    }else if(url.pathname.includes('/operations/')){await bothPosts;value={status:'DONE'};}
    else if(url.pathname.includes('/disks/'))value={sourceImageId:configuration.imageId};
    else if(url.pathname.includes('/getGuestAttributes'))value={queryValue:{items:[{key:'ssh-ed25519',namespace:'hostkeys',value:'ssh-ed25519 '+Buffer.alloc(51,1).toString('base64')}]}};
    else if(req.method==='DELETE'){assert.equal(machines.delete(url.pathname.split('/').at(-1)!),true);deletes++;value={name:'delete-synthetic'};}
    else {value=machines.get(url.pathname.split('/').at(-1)!);if(!value){res.writeHead(404).end('{}');return;}}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
  })().catch(()=>{res.writeHead(500).end('{}');});});
  const children:ChildProcess[]=[];
  try{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const code=`
      import {GceMachineControl} from ${JSON.stringify(new URL('./gceMachineControl.ts',import.meta.url).href)};
      import {randomUUID} from 'node:crypto';
      const api={async request(options){
        const url=new URL(options.url);const reply=await fetch(${JSON.stringify(origin)}+url.pathname+url.search,
          {method:options.method,headers:{'Content-Type':'application/json'},...(options.data?{body:JSON.stringify(options.data)}:{})});
        if(!reply.ok)throw Object.assign(new Error('synthetic refusal'),{response:{status:reply.status}});
        return {data:await reply.json()};
      }};
      const control=new GceMachineControl(${JSON.stringify(configuration)},api,'# synthetic control');
      try{
        const handle=await control.create({runtimeId:randomUUID(),ownerReference:'synthetic-owner',scopeReference:'synthetic-project',
          ttlSeconds:600,memoryMb:512,diskMb:128,maxProcesses:64,cpus:1});
        await control.destroy(handle);console.log(JSON.stringify({pid:process.pid,status:'allocated-and-deleted',name:handle.name}));
      }catch(error){
        if(error.code!=='GCE_EXECUTION_CAPACITY_RESERVED')throw error;
        console.log(JSON.stringify({pid:process.pid,status:'capacity-denied'}));
      }
    `;
    const run=()=>new Promise<{pid:number;status:string;name?:string}>((resolve,reject)=>{
      const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],
        {cwd:fileURLToPath(new URL('../../..',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
      let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Synthetic contention timed out'));},30000);
      child.stdout!.on('data',chunk=>{output+=chunk;if(output.length>4096){child.kill();reject(new Error('Synthetic receipt exceeded limit'));}});
      child.stderr!.resume();child.once('error',reject);
      child.once('close',status=>{clearTimeout(timer);if(status!==0){reject(new Error('Synthetic child failed'));return;}
        try{resolve(JSON.parse(output.trim()));}catch{reject(new Error('Synthetic child receipt invalid'));}});
    });
    const receipts=await Promise.all([run(),run()]);
    assert.notEqual(receipts[0].pid,receipts[1].pid);assert.ok(receipts.every(value=>value.pid!==process.pid));
    assert.deepEqual(receipts.map(value=>value.status).sort(),['allocated-and-deleted','capacity-denied']);
    assert.deepEqual(names,['xroga-exec-slot-1','xroga-exec-slot-1']);
    assert.equal(maximum,1);assert.equal(creates,1);assert.equal(deletes,1);assert.equal(machines.size,0);
  }finally{
    releaseLists();releasePosts();for(const child of children)if(child.exitCode===null)child.kill();
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
