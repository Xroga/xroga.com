"""Prepare the already-approved Batch 1 image at zero traffic, no SQL or Job change.
Keep manifests containing existing environment values only in process memory.
Use resourceVersion for concurrent deployment protection and preserve all voice tags.
"""
import copy,datetime,json,pathlib,subprocess,time,urllib.error,urllib.request
P='project-c40d4821-e647-4fa2-92d'
SHA='ac8168f940d6e56079bbeb5e717ef33001b8b171'
DIGEST=json.loads((pathlib.Path(__file__).resolve().parent/'focused-image.json').read_text())['digest']
IMAGE='us-east4-docker.pkg.dev/'+P+'/cloud-run-source-deploy/xroga-api-release@'+DIGEST
NAME='xroga-api-b15b2-ac8168-check-1031'
TAG='b15b2-ac8168-check'
OLD='xroga-api-batch1-85f-serving-1031'
RUN='https://us-east4-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/'+P
ROOT=pathlib.Path(__file__).resolve().parent
PS='C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'

def cli(*args):
    command='& '+ ' '.join("'"+v.replace("'","''")+"'" for v in [GC,*args,'--account=mabdullah.built@gmail.com','--project='+P,'--quiet'])
    r=subprocess.run([PS,'-NoProfile','-Command',command],capture_output=True,text=True,timeout=60)
    assert r.returncode==0,'GCLOUD_READ_FAILED'
    return r.stdout

TOKEN=cli('auth','print-access-token').strip()
def rest(path,method='GET',body=None):
    req=urllib.request.Request(RUN+path,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'},
        data=json.dumps(body).encode() if body is not None else None,method=method)
    with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)

def unchanged(service):
    live=[v for v in service['status']['traffic'] if v.get('percent',0)>0]
    assert len(live)==1 and live[0]['revisionName']==OLD and live[0]['percent']==100,'DEFAULT_TRAFFIC_DRIFT'

def verify(revision):
    s=revision['spec'];c=s['containers'][0];e={v['name']:v for v in c['env']}
    a=revision['metadata']['annotations']
    assert c['image']==IMAGE and revision['metadata']['labels']['xroga-source-sha']==SHA,'SOURCE_IMAGE_MISMATCH'
    assert e['XROGA_RELEASE_CANDIDATE']['value']=='1','STARTUP_GUARD_MISSING'
    assert e['XROGA_GOOGLE_WORKER_IMAGE']['value']==IMAGE,'CANDIDATE_WORKER_IMAGE_MISMATCH'
    assert a['autoscaling.knative.dev/minScale']=='0' and a['autoscaling.knative.dev/maxScale']=='1','SCALING_MISMATCH'
    assert a['run.googleapis.com/cpu-throttling']=='true','REQUEST_BASED_CPU_REQUIRED'
    assert s['serviceAccountName']=='xroga-api-runtime@'+P+'.iam.gserviceaccount.com','RUNTIME_IDENTITY_CHANGED'

approval=json.loads((ROOT/'FOCUSED-RELEASE-APPROVED.json').read_text(encoding='utf-8-sig'))
assert approval['approved'] and approval['sourceSha']==SHA and approval['packageCommit']=='41a5b936b9a7bc96c84d26ef905b36eeb20b013f','EXACT_FOCUSED_APPROVAL_REQUIRED'
checks=json.loads(subprocess.check_output(['gh','api','repos/Xroga/xroga.com/commits/'+SHA+'/check-runs?per_page=100'],text=True,timeout=40))['check_runs']
for name in ['unit','integrated-candidate','build','deterministic-golden','structured-mission-policy','disposable-policy-database','authenticated-browser']:
    selected=sorted([v for v in checks if v['name']==name],key=lambda v:v.get('completed_at') or '',reverse=True)
    assert selected and selected[0]['conclusion']=='success' and selected[0]['head_sha']==SHA,'EXACT_SOURCE_CI_REQUIRED_'+name
image=json.loads(cli('artifacts','docker','images','describe',IMAGE,'--format=json'))
assert image['image_summary']['digest']==DIGEST,'STANDARD_REPOSITORY_DIGEST_UNAVAILABLE'
service=rest('/services/xroga-api');unchanged(service)
voice_before=[v for v in service['spec']['traffic'] if v.get('tag','').startswith('voice-')]
try:prior=rest('/revisions/'+NAME)
except urllib.error.HTTPError as e:
    if e.code!=404:raise
    prior=None
if prior:
    verify(prior)
else:
    baseline=rest('/revisions/'+OLD)
    template={'metadata':{'name':NAME,'labels':copy.deepcopy(baseline['metadata'].get('labels',{})),
        'annotations':copy.deepcopy(baseline['metadata'].get('annotations',{}))},'spec':copy.deepcopy(baseline['spec'])}
    for key in ['run.googleapis.com/operation-id','run.googleapis.com/urls','run.googleapis.com/ingress-status',
                'serving.knative.dev/creator','serving.knative.dev/lastModifier','client.knative.dev/user-image']:
        template['metadata']['annotations'].pop(key,None)
    template['metadata']['labels']['xroga-source-sha']=SHA
    template['metadata']['annotations'].update({'autoscaling.knative.dev/minScale':'0',
        'autoscaling.knative.dev/maxScale':'1','run.googleapis.com/cpu-throttling':'true'})
    container=template['spec']['containers'][0]
    container['image']=IMAGE
    # Candidate-only artifact smoke, existing compiled tests with no production credentials.
    container['command']=['node']
    container['args']=['--input-type=module','-e',"const {spawnSync}=await import('node:child_process');const r=spawnSync(process.execPath,['--test','dist/builder/cancel.test.js'],{cwd:'/app',timeout:15000,encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'test',HOME:'/tmp',TMPDIR:'/tmp'}});if(r.status!==0)throw new Error('FOCUSED_COMPILED_CANCEL_REGRESSION_FAILED');console.log(JSON.stringify({kind:'focused-runtime-compiled-cancel-pass',source:process.env.XROGA_RELEASE_SHA,passed:Number((r.stdout.match(/# pass (\\d+)/)||[])[1]||0)}));await import('/app/dist/index.js');"]
    env=container['env']
    for name,value in [('XROGA_RELEASE_CANDIDATE','1'),('XROGA_RELEASE_SHA',SHA),('XROGA_GOOGLE_WORKER_IMAGE',IMAGE)]:
        env[:]=[v for v in env if v['name']!=name]
        env.append({'name':name,'value':value})
    metadata={k:copy.deepcopy(service['metadata'][k]) for k in ['name','namespace','resourceVersion','labels','annotations'] if k in service['metadata']}
    for key in ['run.googleapis.com/urls','run.googleapis.com/ingress-status','run.googleapis.com/operation-id','serving.knative.dev/creator','serving.knative.dev/lastModifier']:
        metadata.get('annotations',{}).pop(key,None)
    spec=copy.deepcopy(service['spec'])
    spec['template']=template
    spec['traffic']=[v for v in spec['traffic'] if v.get('tag')!=TAG]+[{'revisionName':NAME,'tag':TAG,'percent':0}]
    journal={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'SUBMITTING_INSPECT_BEFORE_RETRY',
             'revision':NAME,'source':SHA,'digest':DIGEST,'defaultTrafficChanged':False,'jobChanged':False}
    (ROOT/'focused-candidate-operation-journal.json').write_text(json.dumps(journal,indent=2)+'\n')
    rest('/services/xroga-api','PUT',{'apiVersion':'serving.knative.dev/v1','kind':'Service','metadata':metadata,'spec':spec})
end=time.monotonic()+240
while True:
    revision=rest('/revisions/'+NAME)
    if any(v.get('type')=='Ready' and v.get('status')=='True' for v in revision.get('status',{}).get('conditions',[])):break
    assert time.monotonic()<end,'READINESS_TIMEOUT_INSPECT_DO_NOT_REDEPLOY'
    time.sleep(4)
verify(revision)
current=rest('/services/xroga-api');unchanged(current)
voice_after=[v for v in current['spec']['traffic'] if v.get('tag','').startswith('voice-')]
assert all(v in voice_after for v in voice_before),'VOICE_TAGS_CHANGED'
assert current['metadata']['annotations']['run.googleapis.com/ingress']=='internal-and-cloud-load-balancing','INGRESS_CHANGED'
result={'status':'PASS_GUARDED_ZERO_TRAFFIC_CONFIG_NOT_FULL_LIVE_ACCEPTANCE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'source':SHA,'digest':DIGEST,'revision':NAME,'tag':TAG,'minInstances':0,'maxInstances':1,
    'startupGuard':True,'workerImageMatchesCandidate':True,'voiceTagsPreserved':True,
    'defaultRevision':OLD,'defaultPercent':100,'jobChanged':False,'productionSqlApplied':False}
(ROOT/'focused-guarded-candidate-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
