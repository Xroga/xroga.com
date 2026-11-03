"""Submit exactly one approved source build. Journal unknown outcomes, never retry blindly."""
import datetime,gzip,json,os,pathlib,shutil,subprocess,tarfile,time
ROOT=pathlib.Path(__file__).resolve().parent
APP=pathlib.Path(r'C:/Users/hp/Documents/Codex/2026-10-23/g/work/xroga-response-backend-compatible')
SHA='76c158aaeecf82f524659454b7b3726b4d255679'
P='project-c40d4821-e647-4fa2-92d'
IMAGE=f'us-east4-docker.pkg.dev/{P}/cloud-run-source-deploy/xroga-api-release:zurelay-76c158-1103'
PS=r'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC=r'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
J=ROOT/'build-journal.json'
a=json.loads((ROOT/'RELEASE-APPROVED.json').read_text(encoding='utf-8-sig'))
from release_contract import require_approval
require_approval(a,datetime.datetime.now(datetime.timezone.utc))
assert os.environ.get('XROGA_CLEANUP_JOB_ID'),'OWNED_LOCAL_RUNNER_REQUIRED'
assert not J.exists(),'BUILD_ALREADY_JOURNALED_INSPECT_BEFORE_RETRY'
from release_gates import require_pair_ci
ci_receipts = require_pair_ci()

# Do not rebuild an existing immutable candidate just because this local
# controller has no journal. An existing tag needs provenance reconciliation.
describe=[GC,'artifacts','docker','images','describe',IMAGE,'--project='+P,'--account=mabdullah.built@gmail.com','--format=json']
command='& '+' '.join("'"+v.replace("'","''")+"'" for v in describe)
existing=subprocess.run([PS,'-NoProfile','-Command',command],capture_output=True,text=True,timeout=45)
assert existing.returncode!=0,'EXISTING_IMAGE_INSPECT_AND_REUSE_NO_REBUILD'
def image_absence_verified(result):
 # This gcloud version renders the registry 404 as "Image not found."
 # Accept only its exact command-specific error, never a general failure.
 first=result.stderr.strip().splitlines()[0] if result.stderr.strip() else ''
 return result.returncode==1 and not result.stdout.strip() and first=='ERROR: (gcloud.artifacts.docker.images.describe) Image not found.'
assert image_absence_verified(existing),'IMAGE_ABSENCE_NOT_VERIFIED'

def record(state,**more):
 v={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':state,'source':SHA,'imageTag':IMAGE,**more}
 J.write_text(json.dumps(v,indent=2)+'\n');print(json.dumps(v),flush=True)
assert subprocess.check_output(['git','rev-parse',SHA],cwd=APP,text=True).strip()==SHA
work=pathlib.Path(os.environ['TEMP'])/'zurelay-76c158-probe-source-build';work.mkdir()
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
 'options':{'logging':'CLOUD_LOGGING_ONLY'},'tags':['xroga-focused-zurelay-76c158-1103']}
cfg=work/'build.json';cfg.write_text(json.dumps(config))
record('PREPARED_SOURCE_ONLY',archiveBytes=archive.stat().st_size,oneTimeCeilingUsd=a['maximumGoogleUsd'],ci=ci_receipts)
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
