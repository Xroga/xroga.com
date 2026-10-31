// Operator-only compatibility probe. This never issues production authority and
// is not a Xroga authenticated run. It uses only a public deterministic fixture.
import {generateKeyPairSync,sign,randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildChromiumLaunch} from './policy/workers/chromiumLaunch.js';
import {parseBrowserJob} from './policy/workers/browserJob.js';
import {parseBrowserPlan,evaluatePostconditions} from './policy/workers/browserPlan.js';

const root=dirname(fileURLToPath(import.meta.url)),input='/run/xroga-job';
const execute=promisify(execFile);
async function main(){
  if(process.env.XROGA_BROWSER_PROBE!=='public-fixture-only')throw new Error('PROBE_NOT_AUTHORIZED');
  process.umask(0o077);
  const id='probe-'+randomUUID(),now=Date.now();
  const job=parseBrowserJob({version:1,tenantId:'synthetic-probe',userId:'synthetic-probe',projectId:'synthetic-probe',runId:id,taskId:'browser-1',attempt:1,
    allowedOrigins:['https://quotes.toscrape.com'],startUrl:'https://quotes.toscrape.com/',
    limits:{maxDurationMs:120000,maxNavigations:10,maxRedirects:3,maxPages:2,maxResponseBytes:8*1024*1024,maxArtifactBytes:4*1024*1024,maxModelCostMicros:0}});
  const plan=parseBrowserPlan({steps:[{op:'click',selector:'li.next > a'},{op:'extractText',selector:'h1 a',name:'title'},{op:'screenshot',name:'page.png'}],
    expect:[{kind:'extracted',name:'title',equals:'Quotes to Scrape'},{kind:'finalUrlPrefix',prefix:'https://quotes.toscrape.com/page/2/'},{kind:'artifact',name:'page.png'},{kind:'noConsequentialAction'}]},job);
  const launch=buildChromiumLaunch(job,{profileRoot:'/tmp/xroga-browser',proxy:{port:18080,username:'probe-worker',password:randomBytes(24).toString('hex')}});
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const payload=JSON.stringify({version:1,issuedAt:now,expiresAt:now+150000,executionId:id,fence:1,start:{type:'start',job,plan,launch}});
  await mkdir(input,{recursive:true,mode:0o700});
  try{
    for(const [name,value] of Object.entries({
      'envelope.json':JSON.stringify({payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}),
      'issuer-public.pem':publicKey.export({type:'spki',format:'pem'}),
      'expected.json':JSON.stringify({tenantId:job.tenantId,userId:job.userId,runId:job.runId,taskId:job.taskId,attempt:job.attempt,executionId:id,fence:1})
    }))await writeFile(input+'/'+name,value,{mode:0o600,flag:'wx'});
    await execute(process.execPath,[resolve(root,'runCloudJob.mjs')],{timeout:180000,maxBuffer:65536,env:process.env});
    const receipt=JSON.parse(await readFile(input+'/result.json','utf8'));
    if(receipt.executionId!==id||receipt.fence!==1)throw new Error('PROBE_RECEIPT_MISMATCH');
    const result=receipt.result;
    result.artifacts=result.artifacts.map(a=>({...a,bytes:Buffer.from(a.bytes,'base64')}));
    const verified=evaluatePostconditions(plan,{...result,
      artifacts:result.artifacts.map(a=>({...a,size:a.bytes.length})),
      consequentialActions:result.metrics?.consequentialActions});
    if(!verified.every(p=>p.passed))throw new Error('PROBE_POSTCONDITION_FAILED');
    console.log(JSON.stringify({scope:'RUNTIME_COMPATIBILITY_ONLY_NOT_XROGA_ACTIVATION',executionId:id,postconditions:verified.map(p=>({kind:p.kind,passed:p.passed})),
      artifacts:result.artifacts.map(a=>({name:a.name,bytes:a.bytes.length,sha256:createHash('sha256').update(a.bytes).digest('hex')})),models:0}));
  }finally{
    for(const name of ['envelope.json','issuer-public.pem','expected.json','result.json'])await rm(input+'/'+name,{force:true});
  }
}
main().catch(()=>{console.error('BROWSER_RUNTIME_COMPATIBILITY_FAILED');process.exitCode=1;});
