import datetime,json,pathlib,subprocess,urllib.request
ps='C:/Users/hp/AppData/Local/Microsoft/WindowsApps/pwsh.exe'
gc='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
project='project-c40d4821-e647-4fa2-92d'
def cli(*args):
 p=subprocess.run([ps,'-NoProfile','-File',gc,*args,'--account=mabdullah.built@gmail.com','--project='+project,'--quiet','--format=json'],capture_output=True,text=True,timeout=60)
 if p.returncode: raise RuntimeError('READ_ONLY_PREFLIGHT_FAILED')
 return json.loads(p.stdout)
s=cli('run','services','describe','xroga-api','--region=us-east4')
j=cli('run','jobs','describe','xroga-canonical-production','--region=us-east4')
q=cli('tasks','queues','describe','xroga-canonical-production','--location=us-east4')
secrets=cli('secrets','list')
serving=[v['revisionName'] for v in s['status']['traffic'] if v.get('percent')==100]
assert len(serving)==1
r=cli('run','revisions','describe',serving[0],'--region=us-east4')
def container(c):
 return {'image':c.get('image'),'environmentNames':[v['name'] for v in c.get('env',[])],
 'secretReferences':[{'name':v['name'],'reference':v.get('valueSource',v.get('valueFrom',{}))['secretKeyRef']} for v in c.get('env',[]) if 'secretKeyRef' in v.get('valueSource',v.get('valueFrom',{}))],
 'configuredPolicy':{v['name']:v.get('value') for v in c.get('env',[]) if v['name'] in ['XROGA_ALLOWED_MODELS','XROGA_DISABLED_PROVIDERS','XROGA_MODEL_FALLBACK_ORDER']},
 'zurelayKeyEnvironmentPresent':any(v['name']=='ZURELAY_API_KEY' for v in c.get('env',[]))}
result={'observedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'project':project,'productionChanges':False,'providerCalls':0,
 'apiTraffic':s['status'].get('traffic',[]),'nonServingLatestTemplate':container(s['spec']['template']['spec']['containers'][0]),
 'servingRevision':serving[0],'servingSource':r['metadata'].get('labels',{}).get('xroga-source-sha'),'servingApi':container(r['spec']['containers'][0]),
 'jobTemplate':container(j['spec']['template']['spec']['template']['spec']['containers'][0]),'jobLabels':j['metadata'].get('labels',{}),
 'queue':q['state'],'zurelayNamedSecrets':[v['name'] for v in secrets if 'zurelay' in v['name'].lower()],
 'bundleKeyPresence':'NOT_ACCESSED_NO_SECRET_VALUES_READ'}
p=pathlib.Path('docs/operations/zurelay-product-release-20261103');p.mkdir(parents=True,exist_ok=True)
(p/'production-preflight.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
