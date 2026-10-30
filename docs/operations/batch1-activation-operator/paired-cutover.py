"""Approved Batch 1 GCP operations. SQL fence steps are separate reviewed calls.

Every mutation is one resumable stage. Never auto-open admission or force runs
terminal. Sensitive service manifests stay in RAM. Preserve unrelated voice tags.
"""
import copy,datetime,json,pathlib,subprocess,sys,time,urllib.error,urllib.request
P='project-c40d4821-e647-4fa2-92d';R='us-east4'
OLD='xroga-api-batch1-ca94-serving3';NEW='xroga-api-batch1-85f-serving-1031';TAG='batch1-85f-serving-check'
OLD_SHA='ca94c2f8a813524e47f5f7abc868acb1618a1c45';NEW_SHA='85f83e3f1dcbb057d4a28d8a696dae8396d45114'
REPO='us-east4-docker.pkg.dev/'+P+'/cloud-run-source-deploy/xroga-api-release@'
OLD_IMAGE=REPO+'sha256:49505ef989f3c686ca443d2fa6a7265175e35d7a8440f75c6b0773e2d5862888'
NEW_IMAGE=REPO+'sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80'
JOB='projects/'+P+'/locations/'+R+'/jobs/xroga-canonical-production'
SERVICE='projects/'+P+'/locations/'+R+'/services/xroga-api'
QUEUE='projects/'+P+'/locations/'+R+'/queues/xroga-canonical-production'
V1='https://us-east4-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/'+P
ROOT=pathlib.Path(__file__).resolve().parent
MODE=sys.argv[1]
assert MODE in ['preflight','pause','serving','job','promote','resume','status','recover-job','recover-traffic']
PS='C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'

def cli(*args):
 command='& '+' '.join("'"+v.replace("'","''")+"'" for v in [GC,*args,'--account=mabdullah.built@gmail.com','--project='+P,'--quiet'])
 r=subprocess.run([PS,'-NoProfile','-Command',command],capture_output=True,text=True,timeout=60)
 assert r.returncode==0,'GCLOUD_FAILED'
 return r.stdout
TOKEN=cli('auth','print-access-token').strip()
def api(url,method='GET',body=None):
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'},
  method=method,data=json.dumps(body).encode() if body is not None else None)
 with urllib.request.urlopen(req,timeout=60) as s:
  data=s.read()
  return json.loads(data) if data else {}
def run(path,method='GET',body=None):return api('https://run.googleapis.com/v2/'+path,method,body)
def task(path,method='GET'):return api('https://cloudtasks.googleapis.com/v2/'+path,method,{} if method=='POST' else None)
def wait(op):
 end=time.monotonic()+240
 while not op.get('done'):
  assert time.monotonic()<end,'OPERATION_PENDING_INSPECT_BEFORE_RETRY'
  time.sleep(3);op=run(op['name'])
 assert not op.get('error'),'OPERATION_FAILED_INSPECT_RECEIPT'
def record(stage,**extra):
 row={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stage':stage,**extra}
 with (ROOT/'paired-cutover-journal.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
 print(json.dumps(row),flush=True)
def live(service,expected):
 active=[v for v in service['traffic'] if v.get('percent',0)>0]
 assert len(active)==1 and active[0]['revision']==expected and active[0]['percent']==100,'SERVING_SOURCE_DRIFT'
def job_config(job,image,sha):
 t=job['template']['template'];c=t['containers'][0]
 e={v['name']:v.get('value') for v in c.get('env',[])}
 assert c['image']==image and job['labels']['xroga-source-sha']==sha,'JOB_SOURCE_DRIFT'
 assert c.get('command')==['node','dist/scripts/runCanonicalWorker.js'],'JOB_COMMAND_DRIFT'
 assert e['XROGA_GOOGLE_WORKER_IMAGE']==image and e['XROGA_GCE_BASE_IMAGE_ID']=='5308884476316794212','WORKER_CONFIGURATION_DRIFT'
 assert t['serviceAccount']=='xroga-api-runtime@'+P+'.iam.gserviceaccount.com','IDENTITY_DRIFT'
def no_executions():
 values=run(JOB+'/executions?pageSize=1000')
 assert not values.get('nextPageToken'),'EXECUTION_PAGINATION_REVIEW_REQUIRED'
 assert not any(v.get('runningCount',0)>0 for v in values.get('executions',[])),'ACTIVE_JOB_PRESENT'
def fenced():
 receipt=json.loads((ROOT/'gate-closed-live.json').read_text())
 assert receipt['closed'] is True and receipt['nonterminalCanonical']==0,'LIVE_FENCE_PROOF_REQUIRED'
 assert time.time()-receipt['checkedEpoch']<1200,'LIVE_FENCE_PROOF_EXPIRED'
def serving_config(v):
 s=v['spec'];c=s['containers'][0];e={x['name']:x for x in c.get('env',[])}
 assert c['image']==NEW_IMAGE and v['metadata']['labels']['xroga-source-sha']==NEW_SHA,'SERVING_IMAGE_DRIFT'
 assert e['XROGA_GOOGLE_WORKER_IMAGE']['value']==NEW_IMAGE and e.get('XROGA_RELEASE_CANDIDATE',{}).get('value')!='1','SERVING_CONTROLS_DRIFT'
 assert s['serviceAccountName']=='xroga-api-runtime@'+P+'.iam.gserviceaccount.com','SERVING_IDENTITY_DRIFT'

approval=json.loads((ROOT/'CUTOVER-APPROVED-20261031.json').read_text())
assert approval['approved'] is True and approval['packageCommit']=='ca01136f77da1e930559159e1a08f437d0027652','EXACT_OWNER_APPROVAL_REQUIRED'
service=run(SERVICE);job=run(JOB);queue=task(QUEUE)
if MODE=='preflight':
 live(service,OLD);job_config(job,OLD_IMAGE,OLD_SHA);no_executions()
 assert queue['state']=='RUNNING','QUEUE_NOT_RUNNING'
 # This Job has only native control-plane values and secret references. Keep
 # the recovery export, never export the service's literal environment values.
 env=job['template']['template']['containers'][0].get('env',[])
 assert not any(v.get('value') and any(x in v['name'] for x in ['PASSWORD','API_KEY','ACCESS_TOKEN','SECRET_ACCESS']) for v in env),'LITERAL_JOB_SECRET_REFUSED'
 saved={'template':job['template'],'labels':job['labels']}
 p=ROOT/'ca94-job-recovery.json'
 if p.exists():assert json.loads(p.read_text())==saved,'RECOVERY_EXPORT_DRIFT'
 else:p.write_text(json.dumps(saved,indent=2)+'\n')
 record('PREFLIGHT_MATCHED_CA94_NO_ACTIVE_JOB',queue=queue['state'])
elif MODE=='pause':
 fenced();live(service,OLD);job_config(job,OLD_IMAGE,OLD_SHA);no_executions()
 if queue['state']=='RUNNING':task(QUEUE+':pause','POST')
 assert task(QUEUE)['state']=='PAUSED','QUEUE_PAUSE_FAILED'
 record('QUEUE_PAUSED_AFTER_DATABASE_FENCE_AND_DRAIN')
elif MODE=='serving':
 fenced();live(service,OLD);assert queue['state']=='PAUSED';no_executions()
 try:v=api(V1+'/revisions/'+NEW)
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
  v=None
 if not v:
  base=api(V1+'/revisions/'+OLD);current=api(V1+'/services/xroga-api')
  template={'metadata':{'name':NEW,'labels':copy.deepcopy(base['metadata'].get('labels',{})),
   'annotations':copy.deepcopy(base['metadata'].get('annotations',{}))},'spec':copy.deepcopy(base['spec'])}
  for k in ['run.googleapis.com/operation-id','run.googleapis.com/urls','run.googleapis.com/ingress-status','serving.knative.dev/creator','serving.knative.dev/lastModifier','client.knative.dev/user-image']:
   template['metadata']['annotations'].pop(k,None)
  template['metadata']['labels']['xroga-source-sha']=NEW_SHA
  template['metadata']['annotations'].update({'autoscaling.knative.dev/minScale':'1','autoscaling.knative.dev/maxScale':'1','run.googleapis.com/cpu-throttling':'false'})
  c=template['spec']['containers'][0];c['image']=NEW_IMAGE
  c['env']=[e for e in c['env'] if e['name'] not in ['XROGA_RELEASE_CANDIDATE','XROGA_GOOGLE_WORKER_IMAGE']]+[{'name':'XROGA_GOOGLE_WORKER_IMAGE','value':NEW_IMAGE}]
  meta={k:copy.deepcopy(current['metadata'][k]) for k in ['name','namespace','resourceVersion','labels','annotations'] if k in current['metadata']}
  for k in ['run.googleapis.com/urls','run.googleapis.com/ingress-status','run.googleapis.com/operation-id','serving.knative.dev/creator','serving.knative.dev/lastModifier']:meta.get('annotations',{}).pop(k,None)
  spec=copy.deepcopy(current['spec']);spec['template']=template
  spec['traffic']=[x for x in spec['traffic'] if x.get('tag')!=TAG]+[{'revisionName':NEW,'tag':TAG,'percent':0}]
  record('SUBMITTING_NAMED_SERVING_REVISION_ADMISSION_CLOSED',revision=NEW)
  api(V1+'/services/xroga-api','PUT',{'apiVersion':'serving.knative.dev/v1','kind':'Service','metadata':meta,'spec':spec})
 end=time.monotonic()+240
 while True:
  v=api(V1+'/revisions/'+NEW)
  if any(x.get('type')=='Ready' and x.get('status')=='True' for x in v.get('status',{}).get('conditions',[])):break
  assert time.monotonic()<end,'NAMED_SERVING_READINESS_PENDING'
  time.sleep(4)
 serving_config(v);live(run(SERVICE),OLD)
 record('NAMED_SERVING_READY_ZERO_DEFAULT_TRAFFIC',revision=NEW)
elif MODE in ['job','recover-job']:
 fenced();assert queue['state']=='PAUSED';no_executions()
 target=NEW_IMAGE if MODE=='job' else OLD_IMAGE
 sha=NEW_SHA if MODE=='job' else OLD_SHA
 if job['template']['template']['containers'][0]['image']!=target:
  if MODE=='job':
   job_config(job,OLD_IMAGE,OLD_SHA)
   t=copy.deepcopy(job['template']);labels=copy.deepcopy(job['labels']);labels['xroga-source-sha']=NEW_SHA
   t.setdefault('labels',{})['xroga-source-sha']=NEW_SHA
   c=t['template']['containers'][0];c['image']=NEW_IMAGE
   for e in c['env']:
    if e['name']=='XROGA_GOOGLE_WORKER_IMAGE':e['value']=NEW_IMAGE
  else:
   saved=json.loads((ROOT/'ca94-job-recovery.json').read_text());t=saved['template'];labels=saved['labels']
  record('SUBMITTING_JOB_IMAGE',image=target)
  body={'name':JOB,'etag':job['etag'],'template':t,'labels':labels,'annotations':job.get('annotations',{})}
  # Jobs PATCH has no updateMask parameter. Validate the supported full Job
  # request first, then persist it with the same optimistic concurrency token.
  validation=run(JOB+'?validateOnly=true','PATCH',body)
  # A successful validation returns an ephemeral operation which is not
  # registered for subsequent GET polling. Only real mutations are polled.
  assert not validation.get('error'),'JOB_VALIDATION_FAILED'
  record('JOB_VALIDATION_ONLY_ACCEPTED')
  wait(run(JOB,'PATCH',body))
 job_config(run(JOB),target,sha);record('MATCHED_JOB_CONFIGURATION_VERIFIED',source=sha)
elif MODE in ['promote','recover-traffic']:
 fenced();assert queue['state']=='PAUSED';no_executions()
 target=NEW if MODE=='promote' else OLD
 job_config(job,NEW_IMAGE if MODE=='promote' else OLD_IMAGE,NEW_SHA if MODE=='promote' else OLD_SHA)
 if MODE=='promote':serving_config(api(V1+'/revisions/'+NEW))
 traffic=[{'type':'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION','revision':target,'percent':100}]
 traffic += [v for v in service['traffic'] if not v.get('percent') and v.get('tag') not in [TAG,'batch1-ca94-serving','batch1-85f-verify']]
 if service['traffic']!=traffic:
  record('SUBMITTING_DEFAULT_TRAFFIC_WITH_ADMISSION_CLOSED',revision=target)
  wait(run(SERVICE+'?updateMask=traffic','PATCH',{'name':SERVICE,'etag':service['etag'],'traffic':traffic}))
 after=run(SERVICE);live(after,target)
 assert all(v in after['traffic'] for v in service['traffic'] if v.get('tag','').startswith('voice-')),'VOICE_TRAFFIC_CHANGED'
 record('PAIRED_DEFAULT_TRAFFIC_VERIFIED_ADMISSION_STILL_CLOSED',revision=target)
elif MODE=='resume':
 live(service,NEW);job_config(job,NEW_IMAGE,NEW_SHA)
 proof=json.loads((ROOT/'gate-open-85-live.json').read_text());assert proof['source']==NEW_SHA and time.time()-proof['checkedEpoch']<300,'LIVE_OPEN_GATE_PROOF_REQUIRED'
 if queue['state']=='PAUSED':task(QUEUE+':resume','POST')
 assert task(QUEUE)['state']=='RUNNING','QUEUE_RESUME_FAILED'
 record('MATCHED_SOURCE85_QUEUE_RUNNING')
else:
 record('READ_ONLY_STATUS',traffic=service['traffic'],jobImage=job['template']['template']['containers'][0]['image'],queue=queue['state'])
