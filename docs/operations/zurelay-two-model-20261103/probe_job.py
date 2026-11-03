"""Build one bounded probe Job from existing configuration, never alter the serving pair.
All existing environment values stay in memory. No command may print the manifest.
"""
import base64,copy,datetime,hashlib,json,os,pathlib,subprocess,time,urllib.error,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
P='project-c40d4821-e647-4fa2-92d'
R='us-east4'
SHA='3bed89e65411fea9376bce0da8aacd1bd8c72f92'
PACKAGE='zurelay-single-probe-3bed89e6'
NAME='xroga-zurelay-probe-1103'
BASE='projects/'+P+'/locations/'+R
CANONICAL=BASE+'/jobs/xroga-canonical-production'
JOB=BASE+'/jobs/'+NAME
IDENTITY='xroga-api-runtime@'+P+'.iam.gserviceaccount.com'
RECOVERY_SHA='cd5541c6c887a11ba68aaf3cccfb78609f906167'
RECOVERY_DIGEST='sha256:70a2be6f9f8b2452e7e6505ff13f9d1c571899aca18f011e5bbacc731daef28d'
PROJECT='85730a9a-fca9-4eb8-aa89-4e9c6172e2c5'
REPO='us-east4-docker.pkg.dev/'+P+'/cloud-run-source-deploy/xroga-api-release@'

def approval(a):
    assert a.get('approved') is True and a.get('singleProbeApproved') is True and a.get('sourceSha')==SHA and a.get('packageId')==PACKAGE,'EXACT_PROBE_APPROVAL_REQUIRED'
    assert a.get('maximumProviderMicroUsd')==1000 and a.get('maximumProviderRequests')==1 and a.get('maximumOneTimeGoogleUsd')==.5,'SPEND_SCOPE_CHANGED'
    deadline=datetime.datetime.fromisoformat(a['expiresAtUtc'])
    now=datetime.datetime.now(datetime.timezone.utc)
    assert now<deadline<=now+datetime.timedelta(minutes=30),'PROBE_APPROVAL_EXPIRED_OR_WINDOW_TOO_LARGE'

def make_job(canonical,image,expires):
    assert canonical['name']==CANONICAL and canonical['labels']['xroga-source-sha']==RECOVERY_SHA,'CANONICAL_SOURCE_DRIFT'
    source=canonical['template']['template']
    assert len(source['containers'])==1 and source['containers'][0]['image']==REPO+RECOVERY_DIGEST and source['serviceAccount']==IDENTITY,'RECOVERY_CONFIG_DRIFT'
    import re
    assert re.fullmatch(re.escape(REPO)+r'sha256:[a-f0-9]{64}',image),'IMMUTABLE_IMAGE_REQUIRED'
    task={k:copy.deepcopy(v) for k,v in source.items() if k in ['containers','volumes','vpcAccess','executionEnvironment','encryptionKey','serviceAccount']}
    task.update(timeout='120s',maxRetries=0)
    c=task['containers'][0];c['image']=image;c['resources']={'limits':{'cpu':'1','memory':'1Gi'}}
    assert not any(v.get('value') and any(s in v['name'] for s in ['PASSWORD','API_KEY','ACCESS_TOKEN','SECRET_ACCESS','JWT_SECRET','PRIVATE_KEY']) for v in c.get('env',[])),'LITERAL_SECRET_IN_JOB_TEMPLATE'
    script=base64.b64encode((ROOT/'smoke.mjs').read_bytes()).decode()
    # Import only this hash-bound reviewed script. No user-supplied code/prompt.
    c['command']=['node'];c['args']=['--input-type=module','--eval',"try { const m=await import('data:text/javascript;base64,"+script+"'); await m.main(); process.exit(0); } catch { process.stdout.write(JSON.stringify({zurelayProbeFailure:'STOP_VERIFY_LEDGER_NO_RETRY'})+'\\n',()=>process.exit(1)); }"]
    values={'NODE_ENV':'production','XROGA_RELEASE_SHA':SHA,'XROGA_RELEASE_CANDIDATE':'1',
      'XROGA_ZURELAY_PROBE_APPROVAL':SHA,'XROGA_ZURELAY_PROBE_EXPIRES_AT':expires,'XROGA_GOOGLE_WORKER_IMAGE':image}
    replace=set(values)|{'ZURELAY_API_KEY','ZURELAY_JSON_SCHEMA_VERIFIED','XROGA_ALLOWED_MODELS','XROGA_DISABLED_PROVIDERS'}
    c['env']=[v for v in c.get('env',[]) if v['name'] not in replace]+[{'name':k,'value':v} for k,v in values.items()]
    c['env'].append({'name':'ZURELAY_API_KEY','valueSource':{'secretKeyRef':{'secret':'xroga_models_zurelay','version':'1'}}})
    return {'labels':{'xroga-source-sha':SHA,'xroga-owner':'codex-zurelay-probe','xroga-purpose':'single-provider-compatibility'},
      'template':{'taskCount':1,'parallelism':1,'template':task}}

def main():
    assert os.environ.get('XROGA_CLEANUP_JOB_ID'),'OWNED_RUNNER_REQUIRED'
    a=json.loads((ROOT/'PROBE-APPROVED.json').read_text());approval(a)
    from release_gates import require_release_ci
    checks=require_release_ci()
    image=json.loads((ROOT/'image.json').read_text());assert image['source']==SHA and image['digest'].startswith('sha256:'),'VERIFIED_IMAGE_REQUIRED'
    journal=ROOT/'probe-journal.json';assert not journal.exists(),'PROBE_ALREADY_JOURNALED_INSPECT_NO_RETRY'
    ps='C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
    gc='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
    cmd='& '+' '.join("'"+v.replace("'","''")+"'" for v in [gc,'auth','print-access-token','--account=mabdullah.built@gmail.com'])
    p=subprocess.run([ps,'-NoProfile','-Command',cmd],capture_output=True,text=True,timeout=40);assert p.returncode==0,'GOOGLE_AUTH_REQUIRED'
    token=p.stdout.strip()
    def rest(path,method='GET',body=None):
        req=urllib.request.Request('https://run.googleapis.com/v2/'+path,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req,timeout=35) as r:return json.load(r)
        except urllib.error.HTTPError as e:raise RuntimeError('RUN_OPERATION_HTTP_'+str(e.code)) from None
    def wait_operation(value,seconds):
        deadline=time.monotonic()+seconds
        while not value.get('done'):
            if time.monotonic()>=deadline:raise RuntimeError('OPERATION_OBSERVATION_DEADLINE')
            time.sleep(3);value=rest(value['name'])
        if value.get('error'):raise RuntimeError('OPERATION_FAILED_INSPECT_NO_RETRY')
        return value
    canonical=rest(CANONICAL)
    body=make_job(canonical,REPO+image['digest'],a['expiresAtUtc'])
    api_before=rest(BASE+'/services/xroga-api')['trafficStatuses']
    state={'source':SHA,'job':JOB,'checks':checks,'operatorScriptSha256':hashlib.sha256((ROOT/'smoke.mjs').read_bytes()).hexdigest(),
      'state':'CREATE_JOURNALED_NO_AUTOMATIC_RETRY','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'modelRequestsKnown':0}
    def record(**v):state.update(v);journal.write_text(json.dumps(state,indent=2)+'\n')
    record();operation=None;execution=None;created=False
    try:
        creation=rest(BASE+'/jobs?jobId='+NAME,'POST',body);created=True
        wait_operation(creation,60)
        record(state='CREATED_BEFORE_RUN')
        ready=rest(JOB);assert ready['template']['template']['maxRetries']==0 and ready['template']['taskCount']==1,'JOB_LIMIT_DRIFT'
        record(state='RUN_JOURNALED_INSPECT_IF_INTERRUPTED',modelRequestsKnown='UNKNOWN_UNTIL_CANONICAL_RECEIPT')
        operation=rest(JOB+':run','POST',{})
        deadline=time.monotonic()+160
        while not operation.get('done'):
            if time.monotonic()>=deadline:raise RuntimeError('EXECUTION_OBSERVATION_DEADLINE')
            time.sleep(4);operation=rest(operation['name'])
            metadata=operation.get('metadata',{});execution=metadata.get('name',execution)
        execution=operation.get('response',{}).get('name',execution)
        if operation.get('error'):raise RuntimeError('PROBE_EXECUTION_FAILED_INSPECT_LEDGER')
        response=operation.get('response',{})
        assert response.get('succeededCount')==1 and not response.get('failedCount',0),'PROBE_EXECUTION_NOT_SUCCESSFUL'
        record(state='EXECUTION_SUCCEEDED_RECEIPT_RECONCILIATION_REQUIRED',execution=execution,
          next='Read only the exact execution zurelayProbe JSON log, compare canonical ledger settlement and provider key usage before any further inference. Execution success alone is not provider or Workspace acceptance.')
    finally:
        if created:
            # Google enforces the 120-second execution limit even if this local
            # controller is killed. A normal finally additionally removes the Job.
            if execution and execution.startswith(JOB+'/executions/'):
                live=rest(execution)
                if not live.get('completionTime'):wait_operation(rest(execution+':cancel','POST',{}),60)
            wait_operation(rest(JOB,'DELETE'),60)
            try:rest(JOB)
            except RuntimeError as e:
                if str(e)!='RUN_OPERATION_HTTP_404':raise
            else:raise RuntimeError('PROBE_JOB_STILL_PRESENT')
            record(cleanup='JOB_ABSENCE_VERIFIED',execution=execution)
        unchanged=rest(CANONICAL)
        assert unchanged['template']==canonical['template'] and unchanged.get('labels')==canonical.get('labels'),'CANONICAL_JOB_CHANGED'
        assert rest(BASE+'/services/xroga-api')['trafficStatuses']==api_before,'PRODUCTION_TRAFFIC_CHANGED'
        record(servingPairUnchanged=True,productionSqlChanges=False)

if __name__=='__main__':main()
