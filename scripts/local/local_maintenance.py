"""Narrow local cleanup for explicitly owned test jobs. No product scheduler.
Dry-run is the default. Never cleans user source, repositories, WSL or volumes.
"""
import argparse, contextlib, ctypes, datetime, hashlib, importlib.util, json, msvcrt, os, pathlib, re, shutil, subprocess, sys, threading, time, uuid
HERE=pathlib.Path(__file__).resolve().parent
BASE=HERE.parents[1]
MANAGED=BASE/'.local-task-storage'
CONFIG=HERE/'cleanup-policy.json'
MARKER='XROGA_LOCAL_DISPOSABLE_JOB_V1'
UUID=re.compile(r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')
LABELS={'owner':'io.xroga.cleanup.owner','job':'io.xroga.cleanup.job','disposable':'io.xroga.cleanup.disposable'}
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_name(path.name+'.new');temp.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8');os.replace(temp,path)
def audit(action,**values):
 p=MANAGED/'audit';p.mkdir(parents=True,exist_ok=True)
 with (p/(datetime.date.today().isoformat()+'.jsonl')).open('a',encoding='utf-8') as f:f.write(json.dumps({'atUtc':utc(),'action':action,**values})+'\n')
def safe_path(path,root):
 path=pathlib.Path(os.path.abspath(path));root=pathlib.Path(os.path.abspath(root))
 if path==root or not path.is_relative_to(root):raise ValueError('DELETE_TARGET_OUTSIDE_OWNED_CHILD_ROOT')
 current=path
 while True:
  if current.exists() or current.is_symlink():
   if current.lstat().st_file_attributes&1024:raise ValueError('REPARSE_POINT_REFUSED')
  if current.parent==current:break
  current=current.parent
 return path
def tree(path):
 if not path.exists():return []
 rows=[];stack=[path]
 while stack:
  parent=stack.pop()
  for p in parent.iterdir():
   safe_path(p,path)
   if p.is_dir():stack.append(p)
   else:rows.append(p)
 return rows
def safe_remove(path,root,apply):
 path=safe_path(path,root);files=tree(path) if path.is_dir() else [path]
 for f in files:
  if f.name.lower().startswith('.env') or f.name.lower() in ['.git','credentials.json','token','stored_tokens','package.json','pyproject.toml','cargo.toml'] or f.suffix.lower() in ['.vhd','.vhdx','.sqlite','.db','.backup','.pem','.key','.pfx','.p12','.kdbx']:raise ValueError('POTENTIALLY_PERSISTENT_DATA_REFUSED')
 if any(p.name=='.git' for p in path.rglob('.git')):raise ValueError('REPOSITORY_REFUSED')
 count=sum(f.stat().st_size for f in files)
 if apply:
  if path.is_dir():shutil.rmtree(path)
  else:path.unlink()
 audit('DELETE' if apply else 'WOULD_DELETE',path=str(path),bytes=count)
 return count
@contextlib.contextmanager
def lease(path,nonblocking=True):
 path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('a+b') as f:
  f.seek(0,2)
  if not f.tell():f.write(b'0');f.flush()
  f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK if nonblocking else msvcrt.LK_LOCK,1)
  try:yield
  finally:f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
def processes():
 result=subprocess.run([os.environ.get('SystemRoot','C:/Windows')+'/System32/WindowsPowerShell/v1.0/powershell.exe','-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'],capture_output=True,text=True,timeout=30)
 if result.returncode:raise RuntimeError('PROCESS_INVENTORY_UNAVAILABLE')
 value=json.loads(result.stdout);return value if isinstance(value,list) else [value]
def active_reference(path,rows):
 value=str(path).lower()
 return any(value in (r.get('CommandLine') or '').lower() for r in rows)
DOCKER_EXE=str(pathlib.Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Docker/Docker/resources/bin/docker.exe')
LOCAL_CONTEXT='desktop-linux'
DOCKER_CONFIG=pathlib.Path.home()/'.docker'
def docker(args,timeout=30):
 # Explicit local context, never a remote production DOCKER_HOST or buildx node.
 env={k:v for k,v in os.environ.items() if k.upper() not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','BUILDX_BUILDER','DOCKER_CONFIG']}
 inspect=subprocess.run([DOCKER_EXE,'--config',str(DOCKER_CONFIG),'context','inspect',LOCAL_CONTEXT,'--format','{{json .Endpoints.docker.Host}}'],capture_output=True,text=True,timeout=5,env=env)
 if inspect.returncode:raise RuntimeError('LOCAL_DOCKER_CONTEXT_UNAVAILABLE')
 endpoint=json.loads(inspect.stdout)
 if str(endpoint).lower() not in ['npipe:////./pipe/dockerdesktoplinuxengine','npipe:////./pipe/docker_engine']:raise RuntimeError('REMOTE_DOCKER_CONTEXT_REFUSED')
 result=subprocess.run([DOCKER_EXE,'--config',str(DOCKER_CONFIG),'--context',LOCAL_CONTEXT,*args],capture_output=True,text=True,timeout=timeout,env=env)
 if result.returncode:raise RuntimeError('LOCAL_DOCKER_UNAVAILABLE_OR_OPERATION_REFUSED')
 return result.stdout

def cleanup_docker_job(job_id,tmp,apply):
 # No global system/image/container/volume prune, never start Docker Desktop.
 try:docker(['info','--format','{{json .ServerVersion}}'],5)
 except Exception:return ['DOCKER_INSPECTION_UNAVAILABLE']
 filters=['--filter','label='+LABELS['owner']+'='+MARKER,'--filter','label='+LABELS['job']+'='+job_id,'--filter','label='+LABELS['disposable']+'=true']
 remaining=[]
 for short in docker(['ps','-a',*filters,'--format','{{.ID}}']).splitlines():
  if not re.fullmatch(r'[a-f0-9]{12,64}',short):raise RuntimeError('INVALID_CONTAINER_ID')
  fmt='{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Mounts":{{json .Mounts}}}'
  item=json.loads(docker(['inspect','--format',fmt,short]))
  labels=item['Labels'] or {}
  if labels.get(LABELS['owner'])!=MARKER or labels.get(LABELS['job'])!=job_id or labels.get(LABELS['disposable'])!='true':raise RuntimeError('DOCKER_OWNERSHIP_DRIFT')
  if any(m['Type']!='bind' or not pathlib.Path(m['Source']).resolve().is_relative_to(tmp.resolve()) for m in item.get('Mounts',[])):
   remaining.append(item['Id']);audit('SKIP_CONTAINER_PERSISTENT_OR_FOREIGN_MOUNT',id=item['Id']);continue
  audit('REMOVE_OWNED_CONTAINER' if apply else 'WOULD_REMOVE_OWNED_CONTAINER',id=item['Id'],job=job_id)
  if apply:docker(['rm','--force',item['Id']])
 for identifier in docker(['network','ls',*filters,'--format','{{.ID}}']).splitlines():
  if not re.fullmatch(r'[a-f0-9]{12,64}',identifier):raise RuntimeError('INVALID_NETWORK_ID')
  item=json.loads(docker(['network','inspect',identifier]))[0]
  labels=item.get('Labels') or {}
  if labels.get(LABELS['owner'])!=MARKER or labels.get(LABELS['job'])!=job_id or labels.get(LABELS['disposable'])!='true':raise RuntimeError('NETWORK_OWNERSHIP_DRIFT')
  if item.get('Containers'):remaining.append(item['Id']);audit('SKIP_NETWORK_IN_USE',id=item['Id']);continue
  audit('REMOVE_OWNED_NETWORK' if apply else 'WOULD_REMOVE_OWNED_NETWORK',id=item['Id'],job=job_id)
  if apply:docker(['network','rm',item['Id']])
 # Temporary images must have all labels, exactly one task tag, no registry
 # digests and no referencing container. Never force removal or prune parents.
 for identifier in set(docker(['image','ls',*filters,'--no-trunc','--format','{{.ID}}']).splitlines()):
  if not re.fullmatch(r'sha256:[a-f0-9]{64}',identifier):raise RuntimeError('INVALID_IMAGE_ID')
  item=json.loads(docker(['image','inspect',identifier]))[0]
  labels=item.get('Config',{}).get('Labels') or {}
  tag='xroga-local-disposable-'+job_id+':test'
  if labels.get(LABELS['owner'])!=MARKER or labels.get(LABELS['job'])!=job_id or labels.get(LABELS['disposable'])!='true':raise RuntimeError('IMAGE_OWNERSHIP_DRIFT')
  if item.get('Id')!=identifier or item.get('RepoTags')!=[tag] or item.get('RepoDigests'):
   audit('SKIP_IMAGE_RELEASE_RECOVERY_OR_SHARED_REFERENCE',id=identifier);remaining.append(identifier);continue
  if docker(['ps','-a','--filter','ancestor='+identifier,'--format','{{.ID}}']).strip():
   audit('SKIP_IMAGE_IN_USE',id=identifier);remaining.append(identifier);continue
  audit('REMOVE_OWNED_TEMP_IMAGE' if apply else 'WOULD_REMOVE_OWNED_TEMP_IMAGE',id=identifier,job=job_id)
  if apply:docker(['image','rm','--no-prune',identifier])
 return remaining

def clean_jobs(cfg,apply):
 count=0;rows=processes();jobs=MANAGED/'jobs'
 for directory in jobs.iterdir() if jobs.exists() else []:
  if not UUID.fullmatch(directory.name):continue
  try:
   safe_path(directory,jobs)
   metadata=read(directory/'job.json')
   if metadata.get('marker')!=MARKER or metadata.get('id')!=directory.name or metadata.get('retain'):continue
   with lease(directory/'lease.lock'):
    if active_reference(directory,rows):audit('SKIP_ACTIVE_JOB_REFERENCE',job=directory.name);continue
    if metadata.get('status')=='running':
     owner_alive=any(r.get('ProcessId')==metadata.get('ownerPid') for r in rows)
     if owner_alive or time.time()-metadata['startedEpoch']<cfg['abandonedJobGraceSeconds']:audit('SKIP_ACTIVE_OR_RECENT_JOB',job=directory.name);continue
     if apply:
      metadata.update({'status':'abandoned','endedEpoch':metadata['startedEpoch'],'evidencePreserved':not metadata.get('preserveRequested')});write(directory/'job.json',metadata)
     else:audit('WOULD_MARK_ABANDONED_OWNER_DEAD_LEASE_FREE',job=directory.name);continue
    if not metadata.get('evidencePreserved'):audit('SKIP_UNPRESERVED_EVIDENCE',job=directory.name);continue
    if metadata['status']!='passed' and time.time()-metadata['endedEpoch']<cfg['failedJobRetentionDays']*86400:continue
    tmp=directory/'tmp'
    if metadata.get('dockerExpected') and cleanup_docker_job(directory.name,tmp,apply):continue
    if tmp.exists():count+=safe_remove(tmp,directory,apply)
  except (OSError,ValueError,RuntimeError,KeyError) as e:audit('SKIP_JOB',job=directory.name,reason=type(e).__name__+':'+str(e))
 return count

def clean_logs(cfg,apply):
 root=MANAGED/'jobs';count=0;rows=processes()
 for directory in root.iterdir() if root.exists() else []:
  if not UUID.fullmatch(directory.name):continue
  try:
   safe_path(directory,root);m=read(directory/'job.json')
   if m.get('marker')!=MARKER or m.get('id')!=directory.name or m.get('retain') or not m.get('evidencePreserved') or m.get('status')=='running' or active_reference(directory,rows):continue
   if time.time()-m.get('endedEpoch',time.time())<cfg['logRetentionDays']*86400:continue
   with lease(directory/'lease.lock'):
    logs=directory/'logs'
    if logs.exists():count+=safe_remove(logs,directory,apply)
  except (OSError,ValueError,KeyError) as e:audit('SKIP_LOG_RETENTION',job=directory.name,reason=str(e))
 return count

def snapshot():
 result={'atUtc':utc(),'freeBytes':shutil.disk_usage(BASE).free}
 path=MANAGED/'measurements'/'latest.json'
 if path.exists():result['freeChangeSincePreviousBytes']=result['freeBytes']-read(path)['freeBytes']
 write(path,result);return result

class RotatingOutput:
 def __init__(self,directory,max_bytes,count):self.directory=directory;directory.mkdir(parents=True,exist_ok=True);self.max=max_bytes;self.count=count;self.number=0;self.used=0;self.total=0;self.file=None
 def append(self,data):
  self.total+=len(data)
  while data:
   if self.file is None:self.file=(self.directory/('output-'+str(self.number%self.count)+'.log')).open('wb');self.used=0
   amount=min(len(data),self.max-self.used);self.file.write(data[:amount]);self.used+=amount;data=data[amount:]
   if self.used==self.max:self.file.close();self.file=None;self.number+=1
 def close(self):
  if self.file:self.file.close();self.file=None

def run_job(cfg,args):
 if not args.command:raise ValueError('Supply a trusted executable after --')
 command=args.command[1:] if args.command[0]=='--' else args.command
 exe=pathlib.Path(command[0]).resolve()
 if not exe.is_file() or exe.suffix.lower()!='.exe':raise ValueError('Use an absolute .exe path, not a shell command string')
 cwd=pathlib.Path(args.cwd).resolve();identifier=str(uuid.uuid4());directory=MANAGED/'jobs'/identifier;tmp=directory/'tmp';tmp.mkdir(parents=True)
 log=RotatingOutput(directory/'logs',cfg['logFileMiB']*1024**2,cfg['logFileCount'])
 metadata={'marker':MARKER,'id':identifier,'status':'running','ownerPid':os.getpid(),'startedEpoch':time.time(),'cwd':str(cwd),'commandExecutable':str(exe),'argumentCount':len(command)-1,'retain':args.retain,'dockerExpected':args.docker_resources,'preserveRequested':args.preserve,'evidencePreserved':False,'freeBeforeBytes':shutil.disk_usage(BASE).free,'timeoutSeconds':args.timeout,'memoryGiB':args.memory_gib}
 write(directory/'job.json',metadata)
 whitelist=['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','HOMEDRIVE','HOMEPATH','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE']
 env={k:v for k,v in os.environ.items() if k.upper() in [name.upper() for name in whitelist]}
 env.update({'TEMP':str(tmp),'TMP':str(tmp),'XROGA_CLEANUP_JOB_ID':identifier,'XROGA_CLEANUP_OWNER':MARKER,'XROGA_CLEANUP_JOB_ROOT':str(directory),'npm_config_cache':str(tmp/'npm-cache'),'TMPDIR':str(tmp),'XDG_CACHE_HOME':str(tmp/'cache'),'XROGA_LOCAL_ARTIFACTS':str(tmp/'test-artifacts')})
 for name in args.pass_env:
  if name in os.environ:env[name]=os.environ[name]
 spec=importlib.util.spec_from_file_location('owned_windows_job',HERE/'win_job.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 primary=None;reader=None;start=time.monotonic();reason=None;code=None
 with lease(directory/'lease.lock'):
  try:
   if shutil.disk_usage(BASE).free<cfg['minimumFreeGiB']*1024**3:raise RuntimeError('DISK_FREE_FLOOR')
   primary=module.WindowsJob([str(exe),*command[1:]],cwd,env,args.memory_gib*1024**3,cfg['maxProcesses'])
   metadata['childPid']=primary.pid;write(directory/'job.json',metadata)
   def capture():
    while True:
     chunk=primary.output.read(8192)
     if not chunk:break
     log.append(chunk)
   reader=threading.Thread(target=capture,daemon=True);reader.start()
   while code is None:
    code=primary.poll()
    if code is not None:break
    if time.monotonic()-start>args.timeout:reason='TIME_LIMIT';break
    if shutil.disk_usage(BASE).free<cfg['minimumFreeGiB']*1024**3:reason='DISK_FREE_FLOOR';break
    if time.monotonic()-getattr(log,'lastTempCheck',0)>2:
     log.lastTempCheck=time.monotonic()
     if sum(p.stat().st_size for p in tree(tmp))>cfg['jobTempMaxGiB']*1024**3:reason='TEMPORARY_STORAGE_LIMIT';break
    time.sleep(.2)
  except BaseException as e:reason=type(e).__name__ if not isinstance(e,RuntimeError) else str(e)
  finally:
   if primary:primary.close()
   if reader:reader.join(5)
   log.close()
   if primary and primary.output:primary.output.close()
   preserved=[]
   for relative in args.preserve:
    try:
     part=pathlib.Path(relative)
     if part.is_absolute() or '..' in part.parts:raise ValueError('EVIDENCE_PATH_ESCAPES_TMP')
     original=safe_path(tmp/part,tmp)
     if not original.is_file() or original.stat().st_size>128*1024**2 or original.name.startswith('.env') or original.suffix.lower() in ['.key','.pem','.vhd','.vhdx']:raise ValueError('EVIDENCE_MISSING_OR_UNSAFE')
     destination=directory/'artifacts'/part;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,destination)
     def digest(path):
      with path.open('rb') as artifact:return hashlib.file_digest(artifact,'sha256').hexdigest()
     checksum=digest(original)
     if digest(destination)!=checksum:raise ValueError('EVIDENCE_COPY_MISMATCH')
     preserved.append({'path':str(part),'sha256':checksum,'bytes':original.stat().st_size})
    except (OSError,ValueError) as e:reason=str(e)
   metadata['preservedArtifacts']=preserved
   metadata.update({'status':'passed' if code==0 and reason is None else 'failed','exitCode':code,'stopReason':reason,'endedEpoch':time.time(),'outputBytesProduced':log.total,'evidencePreserved':len(preserved)==len(args.preserve),'logBudgetBytes':cfg['logFileMiB']*1024**2*cfg['logFileCount']})
   write(directory/'job.json',metadata)
   # Summary and bounded output remain in the job folder outside disposable tmp.
 if not args.retain:
  try:
   with lease(MANAGED/'maintenance.lock'):
    clean_jobs(cfg,True);clean_logs(cfg,True)
  except OSError:audit('DEFER_CLEANUP_ANOTHER_MAINTENANCE_RUNNING',job=identifier)
 after=snapshot();metadata['freeAfterBytes']=after['freeBytes'];metadata['freeSpaceChangeBytes']=after['freeBytes']-metadata['freeBeforeBytes'];metadata['significantStorageChange']=abs(metadata['freeSpaceChangeBytes'])>=cfg['reportStorageChangeMiB']*1024**2;write(directory/'job.json',metadata)
 audit('JOB_FINISHED',job=identifier,status=metadata['status'],reason=reason,freeSpaceChangeBytes=metadata['freeSpaceChangeBytes'])
 print(json.dumps({'job':identifier,'status':metadata['status'],'reason':reason,'evidence':str(directory),'outputBytesProduced':log.total,'logBudgetBytes':metadata['logBudgetBytes'],'freeSpaceChangeBytes':metadata['freeSpaceChangeBytes'],'significantStorageChange':metadata['significantStorageChange']}))
 return 0 if metadata['status']=='passed' else 1

def main():
 cfg=read(CONFIG)
 if cfg.get('managedRoot')!='.local-task-storage' or cfg.get('marker')!=MARKER:raise RuntimeError('WRONG_OWNED_ROOT_CONFIGURATION')
 MANAGED.mkdir(exist_ok=True)
 parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='action',required=True)
 clean=sub.add_parser('clean');clean.add_argument('--apply',action='store_true')
 run=sub.add_parser('run');run.add_argument('--cwd',required=True);run.add_argument('--timeout',type=int,default=900);run.add_argument('--memory-gib',type=int,default=4);run.add_argument('--retain',action='store_true');run.add_argument('--docker-resources',action='store_true');run.add_argument('--preserve',action='append',default=[]);run.add_argument('--pass-env',action='append',default=[]);run.add_argument('command',nargs=argparse.REMAINDER)
 args=parser.parse_args()
 if args.action=='run':
  if not 1<=args.timeout<=7200 or not 1<=args.memory_gib<=8:raise ValueError('Job bounds refused')
  try:
   with lease(MANAGED/'maintenance.lock'):
    clean_jobs(cfg,True);clean_logs(cfg,True);snapshot()
  except OSError:audit('DEFER_PRE_JOB_RETENTION_BUSY')
  return run_job(cfg,args)
 with lease(MANAGED/'maintenance.lock'):
  before=shutil.disk_usage(BASE).free
  removed=clean_jobs(cfg,args.apply)+clean_logs(cfg,args.apply)
  measurement=snapshot()
  report={'atUtc':utc(),'apply':args.apply,'deletedOrEligibleLogicalBytes':removed,'freeBefore':before,'freeAfter':measurement['freeBytes'],'dockerCacheStatus':'NO_SHARED_OR_GLOBAL_PRUNING'}
  write(MANAGED/'latest-cleanup.json',report);print(json.dumps(report))
 return 0
if __name__=='__main__':
 try:raise SystemExit(main())
 except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as e:
  print(json.dumps({'status':'REFUSED_OR_SKIPPED','reason':str(e)}));raise SystemExit(2)
