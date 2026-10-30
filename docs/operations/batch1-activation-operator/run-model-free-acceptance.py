"""One bounded execution-only override. Never changes the canonical Job template."""
import base64,datetime,hashlib,json,pathlib,subprocess,time,urllib.request,uuid
ROOT=pathlib.Path(__file__).resolve().parent
P='project-c40d4821-e647-4fa2-92d';R='us-east4';JOB='projects/'+P+'/locations/'+R+'/jobs/xroga-canonical-production'
PS='C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
r=subprocess.run([PS,'-NoProfile','-File',GC,'auth','print-access-token','--account=mabdullah.built@gmail.com','--quiet'],capture_output=True,text=True,timeout=45)
assert r.returncode==0,'AUTH_FAILED'
token=r.stdout.strip()
def api(url,method='GET',body=None):
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method,
  data=json.dumps(body).encode() if body is not None else None)
 with urllib.request.urlopen(req,timeout=60) as s:return json.load(s)
def run(path,method='GET',body=None):return api('https://run.googleapis.com/v2/'+path,method,body)
def save(name,value):(ROOT/name).write_text(json.dumps(value,indent=2)+'\n')
def fingerprint(job):return hashlib.sha256(json.dumps({'template':job['template'],'labels':job['labels']},sort_keys=True,separators=(',',':')).encode()).hexdigest()
approval=json.loads((ROOT/'CUTOVER-APPROVED-20261031.json').read_text());assert approval['approved'] and approval['testConsumptionCeilingUsd']==.25
job=run(JOB);c=job['template']['template']['containers'][0]
assert c['image'].endswith('@sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80')
assert c['command']==['node','dist/scripts/runCanonicalWorker.js'] and job['template']['template']['maxRetries']==0
assert api('https://cloudtasks.googleapis.com/v2/projects/'+P+'/locations/'+R+'/queues/xroga-canonical-production')['state']=='RUNNING'
journal=ROOT/'model-free-execution.json'
if journal.exists():
 state=json.loads(journal.read_text())
 assert state.get('execution'),'UNKNOWN_SUBMISSION_OUTCOME_INSPECT_WITHOUT_REPEATING'
else:
 source=(ROOT/'batch1-model-free-acceptance.mjs').read_bytes()
 override={'env':[{'name':'NODE_OPTIONS','value':'--import=data:text/javascript;base64,'+base64.b64encode(source).decode()}]}
 if c.get('name'):override['name']=c['name']
 state={'status':'SUBMITTING_INSPECT_BEFORE_RETRY','startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'nonce':str(uuid.uuid4()),'fixtureSourceSha256':hashlib.sha256(source).hexdigest(),'jobFingerprintBefore':fingerprint(job),'modelCalls':0}
 override['env'].append({'name':'XROGA_BATCH1_FIXTURE_NONCE','value':state['nonce']})
 save(journal.name,state)
 op=run(JOB+':run','POST',{'etag':job['etag'],'overrides':{'taskCount':1,'timeout':'1200s','containerOverrides':[override]}})
 execution=op.get('metadata',{}).get('name','')
 assert execution.startswith(JOB+'/executions/'),'EXECUTION_NAME_MISSING_INSPECT_OPERATION'
 state.update(status='RUNNING',execution=execution,operation=op['name']);save(journal.name,state)
 print(json.dumps({'execution':execution,'fixtureSourceSha256':state['fixtureSourceSha256'],'templateUnchanged':True}),flush=True)
seen=set();events=[];end=time.monotonic()+1230;completed_observed=None
try:
 while time.monotonic()<end:
  result=run(state['execution'])
  logs=api('https://logging.googleapis.com/v2/entries:list','POST',{'resourceNames':['projects/'+P],
   'filter':'resource.type="cloud_run_job" AND resource.labels.job_name="xroga-canonical-production" AND timestamp>="'+state['startedAtUtc']+'"',
   'pageSize':300,'orderBy':'timestamp asc'})
  for entry in logs.get('entries',[]):
   if entry.get('labels',{}).get('run.googleapis.com/execution_name')!=state['execution'].rsplit('/',1)[-1]:continue
   identity=entry.get('insertId')
   if identity in seen:continue
   seen.add(identity)
   value=entry.get('jsonPayload')
   if value is None:
    try:value=json.loads(entry.get('textPayload',''))
    except ValueError:continue
   if isinstance(value,dict) and value.get('kind')=='batch1-source85-production-fixture':
    events.append(value);print(json.dumps(value),flush=True)
  save('model-free-fixture-events.json',events)
  if result.get('completionTime'):
   if completed_observed is None:completed_observed=time.monotonic()
   if not events and time.monotonic()-completed_observed<40:
    time.sleep(5);continue
   state.update(status='SUCCEEDED' if result.get('succeededCount')==1 else 'FAILED',completionTime=result['completionTime'],
    runningCount=result.get('runningCount',0),succeededCount=result.get('succeededCount',0),failedCount=result.get('failedCount',0))
   save(journal.name,state);break
  time.sleep(10)
 else:raise AssertionError('BOUNDED_EXECUTION_TIMEOUT_INSPECT_AND_CLEAN_EXACT_RESOURCES')
finally:
 after=run(JOB)
 assert fingerprint(after)==state['jobFingerprintBefore'],'CANONICAL_TEMPLATE_CHANGED'
 state['canonicalJobTemplateUnchanged']=True
 save(journal.name,state)
print(json.dumps({'status':state['status'],'execution':state['execution'],'canonicalJobTemplateUnchanged':True,'checkCount':len(events)}),flush=True)
assert state['status']=='SUCCEEDED' and any(e['check']=='ALL_BOUNDED_MODEL_FREE_CHECKS_PASS' for e in events),'FIXTURE_DID_NOT_PASS'
