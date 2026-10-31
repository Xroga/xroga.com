"""Read immutable build/registry metadata; never persist credentials or image environment."""
import datetime,hashlib,json,pathlib,subprocess,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
P='project-c40d4821-e647-4fa2-92d';SHA='ac8168f940d6e56079bbeb5e717ef33001b8b171'
PS=r'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC=r'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'
def cli(*args):
 cmd='& '+' '.join("'"+v.replace("'","''")+"'" for v in [GC,*args,'--project='+P,'--account=mabdullah.built@gmail.com','--quiet'])
 r=subprocess.run([PS,'-NoProfile','-Command',cmd],capture_output=True,text=True,timeout=50)
 assert r.returncode==0,'CLOUD_METADATA_READ_FAILED';return r.stdout
j=json.loads((ROOT/'focused-build-journal.retry1.json').read_text())
b=json.loads(cli('builds','describe',j['buildId'],'--region=us-east4','--format=json'))
assert b['status']=='SUCCESS','BUILD_NOT_SUCCESS_NO_IMAGE_OR_DEPLOY_RETRY'
args=b['steps'][0]['args'];assert ['--build-arg','XROGA_RELEASE_SHA='+SHA]==args[args.index('--build-arg'):args.index('--build-arg')+2]
resolved=b['sourceProvenance']['resolvedStorageSource'];assert resolved==j['sourceStorage'],'IMMUTABLE_SOURCE_STORAGE_DRIFT'
image=b['results']['images'][0];assert image['name']==j['imageTag'];digest=image['digest'];assert digest.startswith('sha256:') and len(digest)==71
registry='https://us-east4-docker.pkg.dev/v2/'+P+'/cloud-run-source-deploy/xroga-api-release/'
token=cli('auth','print-access-token').strip()
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def get(path):
 req=urllib.request.Request(registry+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json'})
 with opener.open(req,timeout=45) as r:
  value=r.read(2_000_001);assert len(value)<=2_000_000,'METADATA_SIZE_INVALID';return value
raw=get('manifests/'+digest);assert 'sha256:'+hashlib.sha256(raw).hexdigest()==digest,'MANIFEST_DIGEST_MISMATCH'
manifest=json.loads(raw)
if 'manifests' in manifest:
 candidates=[v for v in manifest['manifests'] if v.get('platform',{}).get('os')=='linux' and v.get('platform',{}).get('architecture')=='amd64']
 assert len(candidates)==1,'PLATFORM_AMBIGUOUS';manifest=json.loads(get('manifests/'+candidates[0]['digest']))
configDigest=manifest['config']['digest'];configRaw=get('blobs/'+configDigest)
assert 'sha256:'+hashlib.sha256(configRaw).hexdigest()==configDigest,'CONFIG_DIGEST_MISMATCH'
cfg=json.loads(configRaw);assert cfg['architecture']=='amd64' and cfg['os']=='linux','WRONG_RUNTIME_PLATFORM'
assert cfg['config']['Labels']['org.opencontainers.image.revision']==SHA,'OCI_SOURCE_LABEL_MISMATCH'
assert 'XROGA_RELEASE_SHA='+SHA in cfg['config']['Env'],'BAKED_SOURCE_SHA_MISMATCH'
size=sum(v['size'] for v in manifest['layers'])+manifest['config']['size'];assert size<=1024**3,'APPROVED_IMAGE_SIZE_EXCEEDED'
r={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':SHA,'digest':digest,'image':j['imageTag'].rsplit(':',1)[0]+'@'+digest,
 'buildId':b['id'],'buildStatus':b['status'],'buildStart':b['startTime'],'buildFinish':b['finishTime'],'sourceStorage':resolved,
 'ociRevisionLabelVerified':True,'bakedSourceVerified':True,'platform':'linux/amd64','compressedBytes':size,'configDigest':configDigest,'productionChanged':False}
(ROOT/'focused-image.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))