"""Use the existing canonical queue for one private readiness GET, then clean the exact Task."""
import datetime,json,pathlib,runpy,sys,time,uuid,urllib.error
ROOT=pathlib.Path(__file__).resolve().parent
kind=sys.argv[1];assert kind in ['candidate','serving']
sys.argv=[str(ROOT/'focused-cutover.py'),'status']
h=runpy.run_path(str(ROOT/'focused-cutover.py'));api=h['api'];run=h['run'];task=h['task'];P=h['P'];QUEUE=h['QUEUE']
revision='xroga-api-b15b2-ac8168-check-1031b' if kind=='candidate' else h['NEW']
tag='b15b2-ac8168-check-b' if kind=='candidate' else h['TAG']
service=api(h['V1']+'/services/xroga-api')
uri=next(v['url'] for v in service['status']['traffic'] if v.get('tag')==tag)
audience=service['status']['url']
receipt=ROOT/('focused-'+kind+'-private-ready.json')
assert not receipt.exists(),'READINESS_TASK_ALREADY_RECORDED_INSPECT_NO_DUPLICATE'
name=QUEUE+'/tasks/focused-ready-ac8168-'+kind+'-'+uuid.uuid4().hex[:10]
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
state={'state':'SUBMITTING_INSPECT_BEFORE_RETRY','revision':revision,'task':name,'startedAtUtc':start,'urlPath':'/ready','defaultTrafficChanged':False}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save()
try:
 body={'task':{'name':name,'dispatchDeadline':'60s','httpRequest':{'httpMethod':'GET','url':uri+'/ready','oidcToken':{'serviceAccountEmail':'xroga-api-runtime@'+P+'.iam.gserviceaccount.com','audience':audience}}}}
 api('https://cloudtasks.googleapis.com/v2/'+QUEUE+'/tasks','POST',body)
 state['state']='DISPATCHED';save();end=time.monotonic()+180
 while time.monotonic()<end:
  result=api('https://logging.googleapis.com/v2/entries:list','POST',{'resourceNames':['projects/'+P],
   'filter':'resource.type="cloud_run_revision" AND resource.labels.revision_name="'+revision+'" AND httpRequest.requestUrl="'+uri+'/ready" AND timestamp>="'+start+'"',
   'pageSize':20,'orderBy':'timestamp desc'})
  entries=[v for v in result.get('entries',[]) if 'httpRequest' in v]
  if entries:
   code=entries[0]['httpRequest'].get('status');state.update(httpStatus=code,latency=entries[0]['httpRequest'].get('latency'),observedAt=entries[0].get('timestamp'))
   state['state']='PASS_PRIVATE_READINESS' if code==200 else 'FAILED_PRIVATE_READINESS';save();break
  time.sleep(5)
 else:state['state']='READINESS_RESULT_PENDING_DO_NOT_REPEAT';save()
finally:
 try:api('https://cloudtasks.googleapis.com/v2/'+name,'DELETE')
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
 state['exactProbeTaskRemoved']=True;save()
print(json.dumps(state))
assert state.get('state')=='PASS_PRIVATE_READINESS','PRIVATE_READINESS_NOT_PASSED_NO_TRAFFIC_SHIFT'