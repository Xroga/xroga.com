"""Approved Response V2 paired backend operations. SQL fence steps are separate reviewed calls.

Every mutation is one resumable stage. Never auto-open admission or force runs
terminal. Sensitive service manifests stay in RAM. Preserve unrelated voice tags.
"""
import copy,datetime,json,pathlib,subprocess,sys,time,urllib.error,urllib.request
from release_contract import RECOVERY,RECOVERY_DIGEST,require_approval,configure_container,verify_container,require_frontend_release,require_fence_receipt
P='project-c40d4821-e647-4fa2-92d';R='us-east4'
OLD='xroga-api-zurelay-3bed89-serving-1103';NEW='xroga-api-zurelay-1a6426-serving-1103';TAG='zurelay-1a6426-serving-check'
OLD_SHA='3bed89e65411fea9376bce0da8aacd1bd8c72f92';NEW_SHA='1a642656542b2e806550b4c7b68517c9df51b22f'
REPO='us-east4-docker.pkg.dev/'+P+'/cloud-run-source-deploy/xroga-api-release@'
OLD_IMAGE=REPO+RECOVERY_DIGEST
NEW_IMAGE=REPO+json.loads((pathlib.Path(__file__).resolve().parent/'image.json').read_text())['digest']
RECOVERY_IMAGE=REPO+RECOVERY_DIGEST
RECOVERY_REV='xroga-api-zurelay-3bed89-serving-1103'
RECOVERY_TAG='zurelay-3bed89-serving-check'
JOB='projects/'+P+'/locations/'+R+'/jobs/xroga-canonical-production'
SERVICE='projects/'+P+'/locations/'+R+'/services/xroga-api'
QUEUE='projects/'+P+'/locations/'+R+'/queues/xroga-canonical-production'
V1='https://us-east4-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/'+P
ROOT=pathlib.Path(__file__).resolve().parent
MODE=sys.argv[1]
assert MODE in ['preflight','pause','serving','recovery-serving','job','promote','resume','status','recover-job','recover-traffic','recover-resume']
PS='C:/Users/hp/AppData/Local/Microsoft/WindowsApps/pwsh.exe'
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
 with (ROOT/'response-paired-cutover-journal.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
 print(json.dumps(row),flush=True)
def live(service,expected):
 active=[v for v in service['traffic'] if v.get('percent',0)>0]
 assert len(active)==1 and active[0]['revision']==expected and active[0]['percent']==100,'SERVING_SOURCE_DRIFT'
def job_config(job,image,sha):
 t=job['template']['template'];c=t['containers'][0]
 e={v['name']:v.get('value') for v in c.get('env',[])}
 assert c['image']==image and job['labels']['xroga-source-sha']==sha,'JOB_SOURCE_DRIFT'
 if sha in [NEW_SHA,RECOVERY]:verify_container(c,sha,image.rsplit('@',1)[1])
 assert c.get('command')==['node','dist/scripts/runCanonicalWorker.js'],'JOB_COMMAND_DRIFT'
 assert e['XROGA_GOOGLE_WORKER_IMAGE']==image and e['XROGA_GCE_BASE_IMAGE_ID']=='5308884476316794212','WORKER_CONFIGURATION_DRIFT'
 assert t['serviceAccount']=='xroga-api-runtime@'+P+'.iam.gserviceaccount.com','IDENTITY_DRIFT'
def no_executions():
 values=run(JOB+'/executions?pageSize=1000')
 assert not values.get('nextPageToken'),'EXECUTION_PAGINATION_REVIEW_REQUIRED'
 assert not any(v.get('runningCount',0)>0 for v in values.get('executions',[])),'ACTIVE_JOB_PRESENT'
def fenced():
 window=json.loads((ROOT/'response-maintenance-window.json').read_text(encoding='utf-8-sig'))
 if not MODE.startswith('recover-'):
  assert datetime.datetime.now(datetime.timezone.utc)<datetime.datetime.fromisoformat(window['deadlineUtc']),'MAINTENANCE_DEADLINE_REACHED_RECOVER_ONLY'
 receipt=json.loads((ROOT/'response-gate-closed-live.json').read_text())
 require_fence_receipt(receipt,time.time())
def serving_config(v,sha=NEW_SHA,image=NEW_IMAGE):
 s=v['spec'];c=s['containers'][0];e={x['name']:x for x in c.get('env',[])}
 verify_container(c,sha,image.rsplit('@',1)[1])
 assert c['image']==image and v['metadata']['labels']['xroga-source-sha']==sha,'SERVING_IMAGE_DRIFT'
 assert e['XROGA_DEPLOYMENT_ENVIRONMENT']['value']=='production','EXPLICIT_ENVIRONMENT_REQUIRED'
 assert e['XROGA_GOOGLE_WORKER_IMAGE']['value']==image and e.get('XROGA_RELEASE_CANDIDATE',{}).get('value')!='1','SERVING_CONTROLS_DRIFT'
 assert s['serviceAccountName']=='xroga-api-runtime@'+P+'.iam.gserviceaccount.com','SERVING_IDENTITY_DRIFT'

def compatible_frontend():
 # This public request must never reuse api(), which adds a Google bearer.
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 request=urllib.request.Request('https://xroga.com/api/release',headers={'Accept':'application/json'})
 with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:
  data=response.read(8193);assert len(data)<=8192,'FRONTEND_METADATA_TOO_LARGE'
  value=json.loads(data);require_frontend_release(value)
 return value

approval=json.loads((ROOT/'RELEASE-APPROVED.json').read_text(encoding='utf-8-sig'))
require_approval(approval,datetime.datetime.now(datetime.timezone.utc),MODE.startswith('recover-'))
if MODE in ['pause','serving','recovery-serving','job','promote','resume']:
 from release_gates import require_pair_ci
 require_pair_ci()
service=run(SERVICE);job=run(JOB);queue=task(QUEUE)
if MODE=='preflight':
 live(service,OLD);job_config(job,OLD_IMAGE,OLD_SHA);no_executions()
 assert queue['state']=='RUNNING','QUEUE_NOT_RUNNING'
 # This Job has only native control-plane values and secret references. Keep
 # the recovery export, never export the service's literal environment values.
 env=job['template']['template']['containers'][0].get('env',[])
 assert not any(v.get('value') and any(x in v['name'] for x in ['PASSWORD','API_KEY','ACCESS_TOKEN','SECRET_ACCESS','JWT_SECRET','PRIVATE_KEY']) for v in env),'LITERAL_JOB_SECRET_REFUSED'
 saved={'template':job['template'],'labels':job['labels']}
 p=ROOT/'response-3bed89-job-recovery.json'
 if p.exists():assert json.loads(p.read_text())==saved,'RECOVERY_EXPORT_DRIFT'
 else:p.write_text(json.dumps(saved,indent=2)+'\n')
 record('PREFLIGHT_MATCHED_RETAINED_3BED89_NO_ACTIVE_JOB',queue=queue['state'])
elif MODE=='pause':
 fenced();live(service,OLD);job_config(job,OLD_IMAGE,OLD_SHA);no_executions()
 if queue['state']=='RUNNING':task(QUEUE+':pause','POST')
 assert task(QUEUE)['state']=='PAUSED','QUEUE_PAUSE_FAILED'
 record('QUEUE_PAUSED_AFTER_DATABASE_FENCE_AND_DRAIN')
elif MODE in ['serving','recovery-serving']:
 if MODE=='recovery-serving':
  NEW=RECOVERY_REV;TAG=RECOVERY_TAG;NEW_SHA=RECOVERY;NEW_IMAGE=RECOVERY_IMAGE
 candidate=json.loads((ROOT/('response-recovery-candidate-private-ready.json' if MODE=='recovery-serving' else 'response-candidate-private-ready.json')).read_text())
 assert candidate['state']=='PASS_PRIVATE_READINESS' and candidate['revision']==('xroga-api-zurelay-3bed89-check-1103' if MODE=='recovery-serving' else 'xroga-api-zurelay-1a6426-check2-1103'),'GUARDED_CANDIDATE_PROOF_REQUIRED'
 fenced();live(service,OLD);assert queue['state']=='PAUSED';no_executions()
 try:v=api(V1+'/revisions/'+NEW)
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
  v=None
 assert v is not None,'ONLY_EXISTING_VERIFIED_REVISION_AUTHORIZED_NO_BUILD_OR_CREATION'
 serving_config(v,NEW_SHA,NEW_IMAGE)
 current=run(SERVICE)
 if MODE=='serving' and not any(t.get('tag')==TAG for t in current['traffic']):
  record('ATTACH_EXISTING_VERIFIED_REVISION_ZERO_TRAFFIC_TAG',revision=NEW)
  wait(run(SERVICE+'?updateMask=traffic','PATCH',{'name':SERVICE,'etag':current['etag'],'traffic':current['traffic']+[{'type':'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION','revision':NEW,'tag':TAG}]}))
 end=time.monotonic()+240
 while True:
  v=api(V1+'/revisions/'+NEW)
  if any(x.get('type')=='Ready' and x.get('status')=='True' for x in v.get('status',{}).get('conditions',[])):break
  assert time.monotonic()<end,'NAMED_SERVING_READINESS_PENDING'
  time.sleep(4)
 serving_config(v,NEW_SHA,NEW_IMAGE);live(run(SERVICE),OLD)
 record('NAMED_SERVING_READY_ZERO_DEFAULT_TRAFFIC',revision=NEW)
elif MODE in ['job','recover-job']:
 if MODE=='job':
  ready=json.loads((ROOT/'response-serving-private-ready.json').read_text())
  assert ready['state']=='PASS_PRIVATE_READINESS' and ready['revision']==NEW,'ZERO_TRAFFIC_SERVING_PROOF_REQUIRED'
 fenced()
 if MODE=='recover-job' and queue['state']=='RUNNING':
  live(service,NEW);no_executions()
  record('SUBMITTING_RECOVERY_QUEUE_PAUSE_ADMISSION_CLOSED')
  task(QUEUE+':pause','POST');queue=task(QUEUE)
 assert queue['state']=='PAUSED';no_executions()
 target=NEW_IMAGE if MODE=='job' else RECOVERY_IMAGE
 sha=NEW_SHA if MODE=='job' else RECOVERY
 if job['template']['template']['containers'][0]['image']!=target:
  if MODE=='job':
   job_config(job,OLD_IMAGE,OLD_SHA)
   t=copy.deepcopy(job['template']);labels=copy.deepcopy(job['labels']);labels['xroga-source-sha']=NEW_SHA
   t.setdefault('labels',{})['xroga-source-sha']=NEW_SHA
   c=t['template']['containers'][0];c['image']=NEW_IMAGE
   for e in c['env']:
    if e['name']=='XROGA_GOOGLE_WORKER_IMAGE':e['value']=NEW_IMAGE
    if e['name']=='XROGA_RELEASE_SHA':e['value']=NEW_SHA
   c['env']=[e for e in c['env'] if e['name']!='XROGA_DEPLOYMENT_ENVIRONMENT']+[{'name':'XROGA_DEPLOYMENT_ENVIRONMENT','value':'production'}]
  else:
   recovery_ready=json.loads((ROOT/'response-recovery-serving-private-ready.json').read_text())
   assert recovery_ready['state']=='PASS_PRIVATE_READINESS' and recovery_ready['revision']==RECOVERY_REV,'COMPATIBLE_RECOVERY_READINESS_REQUIRED'
   t=copy.deepcopy(job['template']);labels=copy.deepcopy(job['labels']);labels['xroga-source-sha']=RECOVERY
   t.setdefault('labels',{})['xroga-source-sha']=RECOVERY
  t['template']['containers'][0]=configure_container(t['template']['containers'][0],sha,target.rsplit('@',1)[1])
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
 target=NEW if MODE=='promote' else RECOVERY_REV
 job_config(job,NEW_IMAGE if MODE=='promote' else RECOVERY_IMAGE,NEW_SHA if MODE=='promote' else RECOVERY)
 if MODE=='promote':
  serving_config(api(V1+'/revisions/'+NEW));compatible_frontend()
  recovery_ready=json.loads((ROOT/'response-recovery-serving-private-ready.json').read_text())
  assert recovery_ready['state']=='PASS_PRIVATE_READINESS' and recovery_ready['revision']==RECOVERY_REV,'COMPATIBLE_RECOVERY_READINESS_REQUIRED'
  serving_config(api(V1+'/revisions/'+RECOVERY_REV),RECOVERY,RECOVERY_IMAGE)
 else:serving_config(api(V1+'/revisions/'+RECOVERY_REV),RECOVERY,RECOVERY_IMAGE)
 traffic=[{'type':'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION','revision':target,'percent':100}]
 traffic += [v for v in service['traffic'] if not v.get('percent') and v.get('tag') not in [TAG,'zurelay-1a6426-check','zurelay-1a6426-check2','zurelay-configdiag-1103']]
 if service['traffic']!=traffic:
  record('SUBMITTING_DEFAULT_TRAFFIC_WITH_ADMISSION_CLOSED',revision=target)
  wait(run(SERVICE+'?updateMask=traffic','PATCH',{'name':SERVICE,'etag':service['etag'],'traffic':traffic}))
 after=run(SERVICE);live(after,target)
 assert all(v in after['traffic'] for v in service['traffic'] if v.get('tag','').startswith('voice-')),'VOICE_TRAFFIC_CHANGED'
 record('PAIRED_DEFAULT_TRAFFIC_VERIFIED_ADMISSION_STILL_CLOSED',revision=target)
elif MODE in ['resume','recover-resume']:
 target_sha=RECOVERY if MODE=='recover-resume' else NEW_SHA
 live(service,RECOVERY_REV if MODE=='recover-resume' else NEW);job_config(job,RECOVERY_IMAGE if MODE=='recover-resume' else NEW_IMAGE,target_sha)
 proof=json.loads((ROOT/'response-gate-open-live.json').read_text());assert proof['source']==target_sha and 0<=time.time()-proof['checkedEpoch']<300,'LIVE_OPEN_GATE_PROOF_REQUIRED'
 if queue['state']=='PAUSED':task(QUEUE+':resume','POST')
 assert task(QUEUE)['state']=='RUNNING','QUEUE_RESUME_FAILED'
 record('MATCHED_SOURCE_QUEUE_RUNNING',source=target_sha)
else:
 record('READ_ONLY_STATUS',traffic=service['traffic'],jobImage=job['template']['template']['containers'][0]['image'],queue=queue['state'])
