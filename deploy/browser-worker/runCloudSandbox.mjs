// Runs inside Google's network-denied sandbox. Only the fixed local CONNECT
// ingress is available. Its bytes go to the canonical proxy over stdin/stdout.
import {createInterface} from 'node:readline';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeJobProcess} from './runCloudJob.mjs';
import {startProxyIngress} from './proxyChannel.mjs';

const abort=new AbortController(),lines=createInterface({input:process.stdin});
let ingress,startSeen=false;
const send=message=>new Promise((resolveSend,reject)=>process.stdout.write(JSON.stringify(message)+'\n',error=>error?reject(error):resolveSend()));
const ready=new Promise((resolveStart,reject)=>{
  const timer=setTimeout(()=>reject(new Error('START_TIMEOUT')),15000);
  lines.on('line',raw=>{
    try{
      if(raw.length>3*1024*1024)throw new Error('FRAME_LIMIT');
      const message=JSON.parse(raw);
      if(message?.type==='start'&&!startSeen){startSeen=true;clearTimeout(timer);resolveStart(message);}
      else if(message?.type==='cancel')abort.abort();
      else if(message?.type?.startsWith('proxy-')&&ingress)ingress.receive(message);
      else throw new Error('INVALID_FRAME');
    }catch{abort.abort();reject(new Error('CHANNEL_FAILED'));}
  });
  lines.on('close',()=>{clearTimeout(timer);abort.abort();reject(new Error('INPUT_CLOSED'));});
});

async function main(){
  const start=await ready;
  const url=new URL(start.launch.proxy.server);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||Number(url.port)<1024)throw new Error('PROXY_INVALID');
  const root=dirname(fileURLToPath(import.meta.url));
  try{
    ingress=await startProxyIngress({port:Number(url.port),send,maxBytes:start.job.limits.maxResponseBytes*2,onFailure:()=>abort.abort()});
    const result=await executeJobProcess(start,{script:resolve(root,'runJob.mjs'),signal:abort.signal,
      timeoutMs:start.job.limits.maxDurationMs,maxOutputBytes:Math.ceil(start.job.limits.maxArtifactBytes*4/3)+1024*1024,
      env:{...start.launch.env,NODE_ENV:'production',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright'},
      onProgress:progress=>{void send({type:'progress',...progress}).catch(()=>abort.abort());}});
    abort.signal.throwIfAborted();
    await ingress.close();ingress=undefined;
    await send({type:'result',result});
  }finally{await ingress?.close();lines.close();}
}
main().catch(async()=>{await send({type:'error',code:'WORKER_FAILED'}).catch(()=>{});lines.close();process.exitCode=1;});
