import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, verifyToolchain } from '../ci/toolchain.mjs';
import { safeTestEnvironment, publicConfigOverridden, runSteps, redactLog } from '../ci/run-baseline.mjs';

verifyToolchain();
const env=safeTestEnvironment();
for(const directory of ['', 'frontend', 'backend'])for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.test','.env.test.local']){
  const relative=[directory,name].filter(Boolean).join('/'),path=join(root,relative);
  if(existsSync(path)&&!publicConfigOverridden(relative,readFileSync(path,'utf8'),env))throw new Error('Golden browser runner requires a clean checkout without developer environment files');
}
if(!existsSync(join(root,'frontend/.next/BUILD_ID')))throw new Error('Build the frontend with fixture environment before browser verification');
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`, artifacts=join(root,'artifacts/batch-01-golden');mkdirSync(artifacts,{recursive:true});
const frontendRequire=createRequire(join(root,'frontend/package.json'));
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const preload=pathToFileURL(join(root,'tests/golden/no-external-fetch.mjs')).href;
const server=spawn(process.execPath,['--import',preload,frontendRequire.resolve('next/dist/bin/next'),'start','frontend','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...env,NODE_ENV:'production',VERCEL_GIT_COMMIT_SHA:sha},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',closed=false;server.stdout.on('data',chunk=>{output+=chunk;});server.stderr.on('data',chunk=>{output+=chunk;});server.on('exit',()=>{closed=true;});
try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    if(closed)throw new Error('Golden built application exited before readiness');
    try{const response=await fetch(`${origin}/auth/login`,{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{/* Bounded local startup only. */}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('Golden local application did not become ready');
  const result=await runSteps([{name:'golden-guest-browser',args:[createRequire(import.meta.url).resolve('@playwright/test/cli'),'test','--config=frontend/playwright.config.ts','frontend/e2e/xroga-golden/public-fixtures.spec.ts','--output=artifacts/batch-01-golden/browser'],timeoutMs:180000}],{cwd:root,env:{...env,PLAYWRIGHT_BASE_URL:origin}});
  for(const item of result.results)writeFileSync(join(artifacts,`${item.name}.log`),item.output);
  writeFileSync(join(artifacts,'browser-manifest.json'),JSON.stringify({sourceSha:sha,scope:'GUEST_FIXTURE_RENDERING_AND_ANONYMOUS_DENIAL_NOT_AUTHENTICATED_PROVIDER_COMPLETION',result:result.exitCode===0?'PASS':'FAIL',exitCode:result.exitCode,results:result.results.map(({output,...item})=>item),productionEffects:false},null,2)+'\n');
  console.log(JSON.stringify({scope:'GUEST_FIXTURE_ONLY',exitCode:result.exitCode}));process.exitCode=result.exitCode;
}finally{
  server.kill();writeFileSync(join(artifacts,'built-server.log'),redactLog(output));
}
