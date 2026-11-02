"""Submit exactly one approved source build. Journal unknown outcomes, never retry blindly."""
import datetime,gzip,json,os,pathlib,shutil,subprocess,tarfile,time
ROOT=pathlib.Path(__file__).resolve().parent
APP=pathlib.Path(r'C:/Users/hp/Documents/Codex/2026-10-23/g/work/xroga-response-backend-compatible')
SHA='4c6319e2fc319ad0384ff3e77c07bc473a3652b2'
P='project-c40d4821-e647-4fa2-92d'
IMAGE=f'us-east4-docker.pkg.dev/{P}/cloud-run-source-deploy/xroga-api-release:response-4c6319-1103'
PS=r'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC=r'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
J=ROOT/'build-journal.json'
a=json.loads((ROOT/'RELEASE-APPROVED.json').read_text(encoding='utf-8-sig'))
assert a['approved'] and a['packageId']=='response-v2-answer-coverage-4c6319e2' and a['sourceSha']==SHA and a.get('structuredPresentationContractApproved') is True
assert os.environ.get('XROGA_CLEANUP_JOB_ID'),'OWNED_LOCAL_RUNNER_REQUIRED'
assert not J.exists(),'BUILD_ALREADY_JOURNALED_INSPECT_BEFORE_RETRY'
from release_gates import require_release_ci
ci_receipts = require_release_ci()

def record(state,**more):
 v={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':state,'source':SHA,'imageTag':IMAGE,**more}
 J.write_text(json.dumps(v,indent=2)+'\n');print(json.dumps(v),flush=True)
assert subprocess.check_output(['git','rev-parse',SHA],cwd=APP,text=True).strip()==SHA
work=pathlib.Path(os.environ['TEMP'])/'response-rich-share-source-build';work.mkdir()
archive=work/'context.tar'
subprocess.run(['git','archive','--format=tar','--output='+str(archive),SHA,'--','Dockerfile.api','.dockerignore','backend'],cwd=APP,check=True,timeout=45)
# Submit the exact Git archive directly. gcloud supports local .tgz sources.
# Extracting then repacking under the owned Windows temp root hits MAX_PATH.
with tarfile.open(archive) as t:
 names=t.getnames()
 assert 'Dockerfile.api' in names
 assert all(not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts for name in names)
 assert not any('.env' in pathlib.PurePosixPath(name).parts or 'node_modules' in pathlib.PurePosixPath(name).parts for name in names)
packed=work/'context.tgz'
with archive.open('rb') as source,gzip.open(packed,'wb') as target:shutil.copyfileobj(source,target)
config={'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','Dockerfile.api','--build-arg','XROGA_RELEASE_SHA='+SHA,'-t',IMAGE,'.']}],
 'images':[IMAGE],'timeout':'900s','serviceAccount':f'projects/{P}/serviceAccounts/574998934848-compute@developer.gserviceaccount.com',
 'options':{'logging':'CLOUD_LOGGING_ONLY'},'tags':['xroga-focused-response-4c6319-1103']}
cfg=work/'build.json';cfg.write_text(json.dumps(config))
record('PREPARED_SOURCE_ONLY',archiveBytes=archive.stat().st_size,oneTimeCeilingUsd=a['maximumOneTimeGoogleUsd'],ci=ci_receipts)
args=[GC,'builds','submit',str(packed),'--config='+str(cfg),'--project='+P,'--region=us-east4','--account=mabdullah.built@gmail.com',
 '--gcs-source-staging-dir=gs://'+P+'_cloudbuild/source','--async','--format=json','--quiet']
cmd='& '+' '.join("'"+v.replace("'","''")+"'" for v in args)
record('SUBMITTING_INSPECT_IF_INTERRUPTED')
r=subprocess.run([PS,'-NoProfile','-Command',cmd],capture_output=True,text=True,timeout=100)
if r.returncode:
 record('SUBMISSION_FAILED_OR_UNKNOWN_INSPECT_CLOUD_BUILD',exitCode=r.returncode)
 raise RuntimeError('Build submission failed; no automatic resubmit. Inspect scoped build metadata.')
b=json.loads(r.stdout)
record('SUBMITTED',buildId=b['id'],status=b.get('status'),sourceStorage=b.get('source',{}).get('storageSource',{}))
