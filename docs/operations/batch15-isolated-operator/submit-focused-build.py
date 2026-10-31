"""Submit exactly one approved source build. Journal unknown outcomes, never retry blindly."""
import datetime,json,os,pathlib,subprocess,tarfile,time
ROOT=pathlib.Path(__file__).resolve().parent
APP=pathlib.Path(r'C:/Users/hp/Documents/Codex/2026-10-23/g/work/xroga-batch15-batch2-activation')
SHA='ac8168f940d6e56079bbeb5e717ef33001b8b171'
P='project-c40d4821-e647-4fa2-92d'
IMAGE=f'us-east4-docker.pkg.dev/{P}/cloud-run-source-deploy/xroga-api-release:b15b2-ac8168-1031'
PS=r'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC=r'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
J=ROOT/'focused-build-journal.retry1.json'
a=json.loads((ROOT/'FOCUSED-RELEASE-APPROVED.json').read_text(encoding='utf-8-sig'))
assert a['approved'] and a['packageCommit']=='41a5b936b9a7bc96c84d26ef905b36eeb20b013f' and a['sourceSha']==SHA
assert os.environ.get('XROGA_CLEANUP_JOB_ID'),'OWNED_LOCAL_RUNNER_REQUIRED'
assert not J.exists(),'BUILD_ALREADY_JOURNALED_INSPECT_BEFORE_RETRY'
def record(state,**more):
 v={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':state,'source':SHA,'imageTag':IMAGE,**more}
 J.write_text(json.dumps(v,indent=2)+'\n');print(json.dumps(v),flush=True)
assert subprocess.check_output(['git','rev-parse',SHA],cwd=APP,text=True).strip()==SHA
work=pathlib.Path(os.environ['TEMP'])/'focused-source-build';work.mkdir()
archive=work/'context.tar'
subprocess.run(['git','archive','--format=tar','--output='+str(archive),SHA,'--','Dockerfile.api','.dockerignore','backend'],cwd=APP,check=True,timeout=45)
context=work/'context';context.mkdir()
with tarfile.open(archive) as t:t.extractall(context,filter='data')
assert (context/'Dockerfile.api').is_file()
assert not list(context.rglob('.env')) and not list(context.rglob('node_modules'))
config={'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','Dockerfile.api','--build-arg','XROGA_RELEASE_SHA='+SHA,'-t',IMAGE,'.']}],
 'images':[IMAGE],'timeout':'900s','serviceAccount':f'projects/{P}/serviceAccounts/574998934848-compute@developer.gserviceaccount.com',
 'options':{'logging':'CLOUD_LOGGING_ONLY'},'tags':['xroga-focused-b15b2-ac8168-1031']}
cfg=work/'build.json';cfg.write_text(json.dumps(config))
record('PREPARED_SOURCE_ONLY',archiveBytes=archive.stat().st_size,oneTimeCeilingUsd=a['maximumOneTimeGoogleUsd'])
args=[GC,'builds','submit',str(context),'--config='+str(cfg),'--project='+P,'--region=us-east4','--account=mabdullah.built@gmail.com',
 '--gcs-source-staging-dir=gs://'+P+'_cloudbuild/source','--async','--format=json','--quiet']
cmd='& '+' '.join("'"+v.replace("'","''")+"'" for v in args)
record('SUBMITTING_INSPECT_IF_INTERRUPTED')
r=subprocess.run([PS,'-NoProfile','-Command',cmd],capture_output=True,text=True,timeout=100)
if r.returncode:
 record('SUBMISSION_FAILED_OR_UNKNOWN_INSPECT_CLOUD_BUILD',exitCode=r.returncode)
 raise RuntimeError('Build submission failed; no automatic resubmit. Inspect scoped build metadata.')
b=json.loads(r.stdout)
record('SUBMITTED',buildId=b['id'],status=b.get('status'),sourceStorage=b.get('source',{}).get('storageSource',{}))