import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.cwd(),req=createRequire(resolve(root,'package.json')),ts=req('typescript');
const old=execFileSync('git',['show','7a3f1167d6f8d56e954d0e7ead692a45ac2354ac:backend/src/workers/browserPlanner.ts'],{encoding:'utf8'});
const js=ts.transpileModule(old,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from (['"])([^'"]+)\1/g,(_all,_quote,spec)=>'from '+JSON.stringify(spec.startsWith('node:')?spec:pathToFileURL(spec.startsWith('.')?resolve(root,'backend/src/workers',spec):req.resolve(spec)).href));
const target=join(process.env.TEMP,'preserved-browser-planner.mjs');writeFileSync(target,js);
const {planBrowserTask}=await import(pathToFileURL(target).href);
let calls=0,reserves=0;
const job={version:1,tenantId:'t1',userId:'u1',projectId:'p1',runId:'r1',taskId:'k1',attempt:1,startUrl:'https://example.com/',allowedOrigins:['https://example.com'],limits:{maxModelCostMicros:0}};
const deps={modelId:'deepseek_v4_flash',reserve:async()=>{reserves++;return{id:'r',reservedMicroUsd:1000000,priceVersion:'t'};},settle:async()=>{},release:async()=>{},client:()=>({model:'m',create:async()=>{calls++;return{usage:{prompt_tokens:1,completion_tokens:1},choices:[{message:{content:'{"steps":[{"op":"screenshot","name":"page.png"}],"expect":[{"kind":"artifact","name":"page.png"}]}'}}]};}})};
try{await assert.rejects(planBrowserTask('synthetic owned fixture',job,deps),{code:'TENANT_AUTH_REQUIRED'});}finally{console.log(JSON.stringify({preservedSource:'7a3f1167',boundary:'browserPlanner',syntheticProviderCalls:calls,reservations:reserves,customerData:false,network:false}));}

