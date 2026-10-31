// One isolated execution, no listener, Docker daemon, scheduler or provider key.
// Admission, live lease checks and private delivery belong to the existing API.
// This entrypoint is NOT permission to deploy without enforced network isolation.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { verifyJobEnvelope } from './jobEnvelope.mjs';

export async function executeJobProcess(start, {script, signal, timeoutMs, maxOutputBytes, env, onProgress = () => {}}) {
  signal.throwIfAborted();
  return new Promise((resolveJob, rejectJob) => {
    const processGroup=process.platform!=='win32';
    const child = spawn(process.execPath, [script], {env, stdio:['pipe','pipe','pipe'],windowsHide:true,detached:processGroup});
    const killTree=()=>{
      try{if(processGroup&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}
      catch(error){if(error?.code!=='ESRCH')failure??=new Error('BROWSER_JOB_CLEANUP_FAILED');}
    };
    let bytes=0, pending='', result, failure, stopTimer;
    const decoder=new StringDecoder('utf8');
    const stop = code => {
      if(failure)return;
      failure = new Error(code);
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.write('{"type":"cancel"}\n',()=>{});
      stopTimer ??= setTimeout(killTree,2000);
    };
    const abort = () => stop('BROWSER_JOB_CANCELLED');
    const timer=setTimeout(()=>stop('BROWSER_JOB_TIMEOUT'),timeoutMs);
    signal.addEventListener('abort',abort,{once:true});
    child.stdin.on('error',()=>stop('BROWSER_JOB_INPUT_FAILED'));
    child.stderr.on('data',()=>{}); // Never forward page-derived diagnostics to cloud logs.
    child.stdout.on('data',chunk=>{
      if(failure)return;
      bytes+=chunk.length;
      if(bytes>maxOutputBytes){stop('BROWSER_JOB_OUTPUT_LIMIT');return;}
      pending+=decoder.write(chunk);
      let end;
      while((end=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,end);pending=pending.slice(end+1);
        let message;try{message=JSON.parse(line);}catch{stop('BROWSER_JOB_PROTOCOL_INVALID');return;}
        if(!message || typeof message!=='object' || Array.isArray(message)){stop('BROWSER_JOB_PROTOCOL_INVALID');return;}
        if(message.type==='result'){
          if(result!==undefined||!message.result||typeof message.result!=='object'||Array.isArray(message.result))stop('BROWSER_JOB_PROTOCOL_INVALID');
          else result=message.result;
          child.stdin.end();
        } else if(message.type==='error'||message.type==='llm') stop('BROWSER_JOB_FAILED');
        else if(message.type==='progress') {
          // No untrusted page text, URLs, credential material or arbitrary object logging.
          if(Number.isSafeInteger(message.index)&&message.index>=0){
            try{onProgress({index:message.index});}catch{stop('BROWSER_JOB_PROGRESS_FAILED');}
          }
        } else stop('BROWSER_JOB_PROTOCOL_INVALID');
        if(failure)return;
      }
    });
    child.once('error',()=>{failure??=new Error('BROWSER_JOB_SPAWN_FAILED');});
    child.once('close',code=>{
      // A child may exit while descendants remain. Linux production uses an
      // owned process group, so clean that group before accepting its result.
      killTree();
      pending+=decoder.end();
      clearTimeout(timer);clearTimeout(stopTimer);signal.removeEventListener('abort',abort);
      if(failure||signal.aborted||code!==0||result===undefined||pending.trim()) rejectJob(failure??new Error('BROWSER_JOB_INCOMPLETE'));
      else resolveJob(result);
    });
    if(signal.aborted)abort();
    else child.stdin.write(JSON.stringify(start)+'\n');
  });
}

async function main(){
  process.umask(0o077);
  if(process.env.XROGA_RUNTIME_ROLE!=='browser-job')throw new Error('BROWSER_JOB_ROLE_REQUIRED');
  for(const [name,value] of Object.entries(process.env)) {
    if(value&&/(API_KEY|ACCESS_TOKEN|SERVICE_ROLE_KEY|DATABASE_URL|DB_PASSWORD|SECRET_ACCESS_KEY|CLIENT_SECRET)$/.test(name))
      throw new Error('BROWSER_JOB_PRIVILEGED_CREDENTIAL_REFUSED');
  }
  const root=dirname(fileURLToPath(import.meta.url));
  const input='/run/xroga-job';
  const [envelope,key,expected]=await Promise.all([
    readFile(input+'/envelope.json','utf8'),readFile(input+'/issuer-public.pem','utf8'),readFile(input+'/expected.json','utf8')]);
  const grant=verifyJobEnvelope(JSON.parse(envelope),key,JSON.parse(expected));
  // Canonical validators are copied from the exact source's compiled backend.
  const [{parseBrowserJob},{parseBrowserPlan},{assertLaunchSafe}]=await Promise.all([
    import('./policy/workers/browserJob.js'),import('./policy/workers/browserPlan.js'),import('./policy/workers/chromiumLaunch.js')]);
  const start=grant.start;
  start.job=parseBrowserJob(start.job);start.plan=parseBrowserPlan(start.plan,start.job);
  assertLaunchSafe(start.launch,'/tmp/xroga-browser');
  const profile=resolve(start.launch.userDataDir),rel=relative('/tmp/xroga-browser',profile);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('BROWSER_JOB_PROFILE_REFUSED');
  const abort=new AbortController();
  const stop=()=>abort.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    await mkdir(profile,{recursive:true,mode:0o700});
    const result=await executeJobProcess(start,{script:resolve(root,'runJob.mjs'),signal:abort.signal,
      timeoutMs:Math.min(start.job.limits.maxDurationMs,grant.expiresAt-Date.now()),
      maxOutputBytes:Math.ceil(start.job.limits.maxArtifactBytes*4/3)+1024*1024,
      env:{...start.launch.env,NODE_ENV:'production',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright'}});
    abort.signal.throwIfAborted();
    // RAM-backed local transfer file. The API must revalidate lease and ownership,
    // postconditions, artifact screening and Drive read-back before accepting it.
    await writeFile(input+'/result.json',JSON.stringify({executionId:grant.executionId,fence:grant.fence,result}),{mode:0o600,flag:'wx'});
    console.log('BROWSER_JOB_RESULT_READY');
  }finally{
    process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
    await rm(profile,{recursive:true,force:true});
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{console.error('BROWSER_JOB_FAILED');process.exitCode=1;});
}
