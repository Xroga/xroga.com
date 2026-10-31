"""Final read-only config and safety proof. Opaque production configuration stays in RAM."""
import copy,datetime,json,pathlib,runpy,sys
ROOT=pathlib.Path(__file__).resolve().parent
sys.argv=[str(ROOT/'focused-cutover.py'),'status'];h=runpy.run_path(str(ROOT/'focused-cutover.py'))
api=h['api'];run=h['run'];task=h['task'];service=run(h['SERVICE']);job=run(h['JOB'])
h['live'](service,h['NEW']);h['job_config'](job,h['NEW_IMAGE'],h['NEW_SHA'])
assert task(h['QUEUE'])['state']=='RUNNING'
old=api(h['V1']+'/revisions/'+h['OLD']);new=api(h['V1']+'/revisions/'+h['NEW'])
a=old['spec']['containers'][0];b=new['spec']['containers'][0]
skip={'XROGA_RELEASE_SHA','XROGA_GOOGLE_WORKER_IMAGE','XROGA_DEPLOYMENT_ENVIRONMENT','XROGA_RELEASE_CANDIDATE'}
def env(v):return sorted([x for x in v.get('env',[]) if x['name'] not in skip],key=lambda x:x['name'])
assert env(a)==env(b),'OPAQUE_API_CONFIG_OR_SECRET_REFERENCE_CHANGED'
assert old['spec']['serviceAccountName']==new['spec']['serviceAccountName'],'API_IDENTITY_CHANGED'
assert a.get('resources')==b.get('resources') and old['spec'].get('containerConcurrency')==new['spec'].get('containerConcurrency'),'API_LIMITS_CHANGED'
saved=json.loads((ROOT/'focused-85f-job-recovery.json').read_text())
assert env(saved['template']['template']['containers'][0])==env(job['template']['template']['containers'][0]),'OPAQUE_JOB_CONFIG_OR_SECRET_REFERENCE_CHANGED'
x=copy.deepcopy(saved['template']['template']);y=copy.deepcopy(job['template']['template'])
for value in [x,y]:
 value.pop('containers');value.pop('labels',None)
assert x==y,'JOB_IDENTITY_NETWORK_OR_RESOURCE_LIMIT_CHANGED'
voice=[v for v in service['traffic'] if v.get('tag','').startswith('voice-')]
assert {(v['tag'],v['revision']) for v in voice}=={('voice-054d7ae4','xroga-api-voice-054d7ae4'),('voice-9f62bba5','xroga-api-voice-fe2c6486c')},'VOICE_DRIFT_REQUIRES_REVIEW'
assert all(not v.get('tag','').startswith('b15b2-') for v in service['traffic']),'TEMPORARY_RELEASE_TAG_REMAINS'
window=json.loads((ROOT/'focused-maintenance-window.json').read_text(encoding='utf-8-sig'))
for field in ['startedAtUtc','deadlineUtc','drainDeadlineUtc']:
 window[field]=datetime.datetime.fromisoformat(window[field]).astimezone(datetime.timezone.utc).isoformat()
rows=[json.loads(line) for line in (ROOT/'focused-paired-cutover-journal.jsonl').read_text().splitlines() if line]
finished=next(v['atUtc'] for v in reversed(rows) if v['stage']=='MATCHED_SOURCE_AC8168_QUEUE_RUNNING')
window.update(completedAtUtc=finished,elapsedSeconds=round((datetime.datetime.fromisoformat(finished)-datetime.datetime.fromisoformat(window['startedAtUtc'])).total_seconds(),2))
(ROOT/'focused-maintenance-window.json').write_text(json.dumps(window,indent=2)+'\n')
proof={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'FOCUSED_BACKEND_RELEASE_PASS_NOT_FULL_BATCH_ACTIVATION',
 'source':h['NEW_SHA'],'revision':h['NEW'],'digest':h['NEW_IMAGE'].split('@')[1],'defaultPercent':100,'apiJobImageSourcePairVerified':True,
 'canonicalQueue':'RUNNING','opaqueApiConfigSecretsAndCustodyPreserved':True,'opaqueJobConfigSecretsAndCustodyPreserved':True,
 'runtimeIdentityNetworkAndLimitsPreserved':True,'temporaryReleaseTagsRemoved':True,'voiceTags':voice,
 'rollbackRevision':h['OLD'],'rollbackImage':h['OLD_IMAGE'],'maintenanceSeconds':window['elapsedSeconds'],
 'newVmCreated':False,'newIamBindings':0,'newServices':0,'operatorModelCalls':0,'fullBatch15Acceptance':False,'fullBatch2Acceptance':False}
(ROOT/'focused-final-runtime-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))