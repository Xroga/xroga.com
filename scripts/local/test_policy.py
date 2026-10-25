import ctypes,importlib.util,json,os,pathlib,shutil,subprocess,sys,tempfile,time,unittest,uuid
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('maintenance',HERE/'local_maintenance.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
spec=importlib.util.spec_from_file_location('win_job',HERE/'win_job.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class PolicyTests(unittest.TestCase):
 def setUp(self):
  self.base=pathlib.Path(tempfile.mkdtemp(prefix='policy-owned-fixture-',dir=HERE.parent));self.root=self.base/'managed';self.root.mkdir();self.old_root=m.MANAGED;m.MANAGED=self.root
  self.cfg=m.read(HERE/'cleanup-policy.json');self.cfg['failedJobRetentionDays']=7
 def tearDown(self):
  m.MANAGED=self.old_root
  assert self.base.resolve().is_relative_to(HERE.parent.resolve()) and self.base.name.startswith('policy-owned-fixture-')
  shutil.rmtree(self.base)
 def job(self,status='passed',age_days=0):
  d=self.root/'jobs'/str(uuid.uuid4());tmp=d/'tmp';tmp.mkdir(parents=True);(tmp/'fixture.tmp').write_text('disposable')
  m.write(d/'job.json',{'marker':m.MARKER,'id':d.name,'status':status,'ownerPid':0,'startedEpoch':time.time()-age_days*86400,'endedEpoch':time.time()-age_days*86400,'evidencePreserved':True,'retain':False,'dockerExpected':False})
  return d,tmp
 def test_dry_run_then_success_cleanup_preserves_evidence(self):
  d,tmp=self.job();(d/'logs').mkdir();(d/'logs'/'output-0.log').write_text('required test evidence')
  with patch.object(m,'processes',return_value=[]):
   self.assertGreater(m.clean_jobs(self.cfg,False),0);self.assertTrue(tmp.exists())
   self.assertGreater(m.clean_jobs(self.cfg,True),0);self.assertFalse(tmp.exists())
  self.assertTrue((d/'logs'/'output-0.log').exists());self.assertTrue((d/'job.json').exists())
 def test_active_lease_and_retention_hold_prevent_cleanup(self):
  d,tmp=self.job()
  with patch.object(m,'processes',return_value=[]),m.lease(d/'lease.lock'):
   self.assertEqual(m.clean_jobs(self.cfg,True),0);self.assertTrue(tmp.exists())
  meta=m.read(d/'job.json');meta['retain']=True;m.write(d/'job.json',meta)
  with patch.object(m,'processes',return_value=[]):self.assertEqual(m.clean_jobs(self.cfg,True),0)
 def test_unknown_persistent_data_and_git_metadata_are_never_removed(self):
  for name in ['important.db','.git','.env.local','package.json']:
   d,tmp=self.job();p=tmp/name
   if name=='.git':p.mkdir()
   else:p.write_text('synthetic irreplaceable sentinel')
   with patch.object(m,'processes',return_value=[]):self.assertEqual(m.clean_jobs(self.cfg,True),0)
   self.assertTrue(p.exists())
 def test_outside_paths_and_windows_junction_are_refused(self):
  d,tmp=self.job();outside=self.base/'outside';outside.mkdir();sentinel=outside/'source.txt';sentinel.write_text('must survive')
  with self.assertRaises(ValueError):m.safe_remove(outside,tmp,True)
  junction=tmp/'escape'
  result=subprocess.run(['powershell.exe','-NoProfile','-Command','New-Item -ItemType Junction -Path $args[0] -Value $args[1] | Out-Null',str(junction),str(outside)],capture_output=True,text=True)
  if result.returncode:
   # Use an explicitly quoted, fixture-only native command if PowerShell -Command does not bind trailing args.
   result=subprocess.run(['powershell.exe','-NoProfile','-Command',"New-Item -ItemType Junction -Path '"+str(junction)+"' -Value '"+str(outside)+"' | Out-Null"],capture_output=True,text=True)
  self.assertEqual(result.returncode,0)
  try:
   with self.assertRaises(ValueError):m.safe_remove(tmp,d,True)
   self.assertEqual(sentinel.read_text(),'must survive')
  finally:os.rmdir(junction)
 def test_failed_jobs_wait_seven_days_and_required_evidence_is_retained(self):
  d,tmp=self.job('failed',1)
  with patch.object(m,'processes',return_value=[]):self.assertEqual(m.clean_jobs(self.cfg,True),0)
  meta=m.read(d/'job.json');meta['endedEpoch']=time.time()-8*86400;meta['evidencePreserved']=False;m.write(d/'job.json',meta)
  with patch.object(m,'processes',return_value=[]):self.assertEqual(m.clean_jobs(self.cfg,True),0)
  self.assertTrue(tmp.exists())
 def test_dead_owner_abandoned_job_is_reclaimed_after_retention(self):
  d,tmp=self.job('running',10)
  with patch.object(m,'processes',return_value=[]):self.assertGreater(m.clean_jobs(self.cfg,True),0)
  self.assertFalse(tmp.exists());self.assertEqual(m.read(d/'job.json')['status'],'abandoned')
 def test_rotating_output_is_bounded(self):
  writer=m.RotatingOutput(self.base/'logs',1024,3)
  for _ in range(100):writer.append(b'x'*8192)
  writer.close();self.assertEqual(writer.total,819200);self.assertLessEqual(sum(p.stat().st_size for p in (self.base/'logs').iterdir()),3072)
 def test_storage_monitor_tolerates_file_rename_but_not_permission_failure(self):
  from types import SimpleNamespace
  missing=SimpleNamespace(stat=lambda: (_ for _ in ()).throw(FileNotFoundError()))
  with patch.object(m,'tree',return_value=[missing]):self.assertIsNone(m.temporary_usage(self.base))
  denied=SimpleNamespace(stat=lambda: (_ for _ in ()).throw(PermissionError()))
  with patch.object(m,'tree',return_value=[denied]):
   with self.assertRaises(PermissionError):m.temporary_usage(self.base)
 def test_docker_volume_or_foreign_owner_prevents_removal(self):
  d,tmp=self.job()
  for mode in ['volume','foreign']:
   calls=[]
   def fake(args,timeout=30):
    calls.append(args)
    if args[0]=='info':return '"synthetic"'
    if args[0]=='ps':return 'a'*12
    if args[0]=='inspect':return json.dumps({'Id':'a'*64,'Labels':{m.LABELS['owner']:m.MARKER if mode=='volume' else 'foreign',m.LABELS['job']:d.name,m.LABELS['disposable']:'true'},'Mounts':[{'Type':'volume','Source':'must-retain'}]})
    if args[:2] in [['network','ls'],['image','ls']]:return ''
    raise AssertionError('Unexpected Docker mutation')
   with patch.object(m,'docker',side_effect=fake):
    if mode=='foreign':
     with self.assertRaises(RuntimeError):m.cleanup_docker_job(d.name,tmp,True)
    else:self.assertTrue(m.cleanup_docker_job(d.name,tmp,True))
   self.assertFalse(any(c[0] in ['rm','volume','system'] or c[:2]==['image','rm'] for c in calls))
 def test_windows_job_atomically_contains_and_kills_descendants(self):
  job=w.WindowsJob([sys.executable,'-c',"import subprocess,sys,time;p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)']);print(p.pid,flush=True);time.sleep(120)"],self.base,dict(os.environ),128*1024**2,8)
  child_pid=int(job.output.readline().decode().strip());self.assertGreater(child_pid,0)
  job.close();job.output.close()
  k=ctypes.WinDLL('kernel32',use_last_error=True);k.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong];k.OpenProcess.restype=ctypes.c_void_p;k.CloseHandle.argtypes=[ctypes.c_void_p];k.GetExitCodeProcess.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)]
  handle=k.OpenProcess(0x1000,False,child_pid)
  if handle:
   try:code=ctypes.c_ulong();self.assertTrue(k.GetExitCodeProcess(handle,ctypes.byref(code)));self.assertNotEqual(code.value,259)
   finally:k.CloseHandle(handle)
 def test_only_explicit_owned_container_and_empty_network_are_removed(self):
  d,tmp=self.job();calls=[]
  def fake(args,timeout=30):
   calls.append(args)
   if args[0]=='info':return '"synthetic"'
   if args[0]=='ps':return 'a'*12
   if args[0]=='inspect':return json.dumps({'Id':'a'*64,'Labels':{m.LABELS['owner']:m.MARKER,m.LABELS['job']:d.name,m.LABELS['disposable']:'true'},'Mounts':[]})
   if args[0]=='rm':return ''
   if args[:2]==['network','ls']:return 'b'*12
   if args[:2]==['network','inspect']:return json.dumps([{'Id':'b'*64,'Labels':{m.LABELS['owner']:m.MARKER,m.LABELS['job']:d.name,m.LABELS['disposable']:'true'},'Containers':{}}])
   if args[:2]==['network','rm']:return ''
   if args[:2]==['image','ls']:return ''
   raise AssertionError('Unexpected Docker operation')
  with patch.object(m,'docker',side_effect=fake):self.assertEqual(m.cleanup_docker_job(d.name,tmp,True),[])
  self.assertIn(['rm','--force','a'*64],calls);self.assertIn(['network','rm','b'*64],calls)
  self.assertFalse(any(c[0] in ['volume','system'] or c[:2]==['image','rm'] for c in calls))
 def test_parent_crash_closes_job_and_kills_child(self):
  code="import importlib.util,sys,os;s=importlib.util.spec_from_file_location('j',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);j=m.WindowsJob([sys.executable,'-c','import time;time.sleep(120)'],os.getcwd(),dict(os.environ),128*1024**2,8);print(j.pid,flush=True);os._exit(0)"
  result=subprocess.run([sys.executable,'-c',code,str(HERE/'win_job.py')],capture_output=True,text=True,timeout=10)
  self.assertEqual(result.returncode,0);pid=int(result.stdout.strip())
  k=ctypes.WinDLL('kernel32',use_last_error=True);k.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong];k.OpenProcess.restype=ctypes.c_void_p;k.GetExitCodeProcess.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)];k.CloseHandle.argtypes=[ctypes.c_void_p]
  handle=k.OpenProcess(0x1000,False,pid)
  if handle:
   try:status=ctypes.c_ulong();self.assertTrue(k.GetExitCodeProcess(handle,ctypes.byref(status)));self.assertNotEqual(status.value,259)
   finally:k.CloseHandle(handle)
 def test_default_failed_and_interrupted_jobs_clean_immediately_after_evidence(self):
  cfg=m.read(HERE/'cleanup-policy.json')
  for status in ['failed','abandoned']:
   d,tmp=self.job(status)
   with patch.object(m,'processes',return_value=[]):self.assertGreater(m.clean_jobs(cfg,True),0)
   self.assertFalse(tmp.exists());self.assertTrue((d/'job.json').exists())
 def test_image_requires_exact_task_tag_no_digest_and_no_container_reference(self):
  for mode in ['owned','release','digest','used','foreign']:
   d,tmp=self.job();calls=[];identifier='sha256:'+'c'*64
   def fake(args,timeout=30):
    calls.append(args)
    if args[0]=='info':return '"synthetic"'
    if args[0]=='ps':return 'a'*12 if mode=='used' and 'ancestor='+identifier in args else ''
    if args[:2]==['network','ls']:return ''
    if args[:2]==['image','ls']:return identifier
    if args[:2]==['image','inspect']:
     return json.dumps([{'Id':identifier,'Config':{'Labels':{m.LABELS['owner']:m.MARKER if mode!='foreign' else 'foreign',m.LABELS['job']:d.name,m.LABELS['disposable']:'true'}},'RepoTags':['xroga-release:recovery' if mode=='release' else 'xroga-local-disposable-'+d.name+':test'],'RepoDigests':['retained@sha256:example'] if mode=='digest' else []}])
    if args[:2]==['image','rm']:return ''
    raise AssertionError('Unexpected Docker operation')
   with patch.object(m,'docker',side_effect=fake):
    if mode=='foreign':
     with self.assertRaisesRegex(RuntimeError,'IMAGE_OWNERSHIP_DRIFT'):m.cleanup_docker_job(d.name,tmp,True)
    else:m.cleanup_docker_job(d.name,tmp,True)
   removals=[c for c in calls if c[:2]==['image','rm']]
   self.assertEqual(removals,[['image','rm','--no-prune',identifier]] if mode=='owned' else [])
   self.assertFalse(any('prune' in c or 'volume' in c for c in calls))
 def test_remote_docker_context_is_rejected_before_engine_calls(self):
  from types import SimpleNamespace
  calls=[]
  def fake(command,**kwargs):
   calls.append(command);return SimpleNamespace(returncode=0,stdout=json.dumps('ssh://production.example.invalid'))
  with patch.object(m.subprocess,'run',side_effect=fake):
   with self.assertRaisesRegex(RuntimeError,'REMOTE_DOCKER_CONTEXT_REFUSED'):m.docker(['info'])
  self.assertEqual(len(calls),1);self.assertIn('inspect',calls[0]);self.assertNotIn('info',calls[0])
if __name__=='__main__':unittest.main(verbosity=2)
