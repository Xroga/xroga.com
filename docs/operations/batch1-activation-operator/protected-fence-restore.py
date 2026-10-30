"""Isolated retained-backup compatibility test, never a production connection.

Run only in the owner Cloud Shell after the no-swap check. Customer plaintext
stays in anonymous pipes/process RAM and the exact networkless tmpfs container.
Only synthetic rows are queried by the fence tests. Errors are fixed categories.
"""
import concurrent.futures, datetime, hashlib, json, os, pathlib, re
import shutil, subprocess, sys, time, uuid

HOME = pathlib.Path.home()
ROOT = pathlib.Path(__file__).resolve().parent
NAME = 'xroga-batch1-fence-restore-20261031'
IMAGE = 'supabase/postgres@sha256:69e57a409628a809e3778a4d176eb97e32d7c961131ac025b77ad094c0b2d49e'
DB = 'xroga_batch1_fence_restore'
ADMIN = 'xroga_batch1_restore_admin'
OWNER = 'XROGA_LOCAL_DISPOSABLE_JOB_V1'
META = ROOT / 'restore-container.json'
DONE = ROOT / 'restore-cleanup.json'
RECEIPT = ROOT / 'protected-fence-restore-receipt.json'
OLD = 'ca94c2f8a813524e47f5f7abc868acb1618a1c45'
NEW = '85f83e3f1dcbb057d4a28d8a696dae8396d45114'
PREFIX = 'gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/'
HASHES = {'cutover-fence-upgrade.DRAFT.sql':'3b4b28cba0f76714feb9758b4d4917ef619593895d296d7b1af958f9a2dddeed',
          'cutover-fence-rollback.DRAFT.sql':'a188225ef4e9b3bbc8c2216e22f85ec3d0e4e2b9dc81d1ff794ee8fd1c508be2',
          'released-google-canonical-deliveries.sql':'1fca51799370f969165de860091591984b84198217488d19df98c591a4ce160d',
          'cutover-pause.sql':'2ba3b7649cacb260b39b5708e44f47c6f16f2ff4eef6d11a6fb857f423b53fa9',
          'cutover-allow-85.sql':'0849fc12176ee20efdb831911f826cc4132dccc51dfbdd5e105154c1b264b13a',
          'cutover-allow-ca94.sql':'54421453ee0b37d11c1609d56bffb295273bbe465463537fa9ce5a4c4a1ec501'}

def cmd(args, data=None, timeout=120):
    return subprocess.run(args, input=data, capture_output=True, timeout=timeout)

def docker(*args, data=None, timeout=120):
    return cmd(['docker', *args], data, timeout)

def owned(info, job):
    labels = info['Config'].get('Labels', {})
    assert labels.get('io.xroga.cleanup.owner') == OWNER, 'WRONG_OWNER'
    assert labels.get('io.xroga.cleanup.job') == job, 'WRONG_JOB'
    assert labels.get('io.xroga.cleanup.disposable') == 'true', 'NOT_DISPOSABLE'
    h = info['HostConfig']
    assert h['NetworkMode'] == 'none' and not h.get('PortBindings'), 'NETWORK_NOT_ISOLATED'
    assert h['LogConfig']['Type'] == 'none', 'PERSISTED_LOGS_REFUSED'
    assert all(m['Type'] == 'tmpfs' for m in info.get('Mounts', [])), 'PERSISTENT_MOUNT_REFUSED'
    assert set(h['Tmpfs']) == {'/var/lib/postgresql/data','/var/run/postgresql','/var/log/postgresql'}, 'TMPFS_MISMATCH'

def cleanup(job):
    r = docker('inspect', NAME)
    if r.returncode == 0:
        owned(json.loads(r.stdout)[0], job)
        assert docker('rm', '--force', NAME).returncode == 0, 'EXACT_CLEANUP_FAILED'
    assert docker('inspect', NAME).returncode != 0, 'CONTAINER_STILL_PRESENT'
    DONE.write_text(json.dumps({'atUtc':now(),'containerRemoved':True,'tmpfsDestroyed':True,'encryptedRecoveryAssetsPreserved':True}))

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sql(text, user=ADMIN, db=DB, expected=True):
    r = docker('exec','-i','--env','PGPASSWORD=synthetic-isolated-restore-only',NAME,'psql',
               '--host=127.0.0.1','--username='+user,'--dbname='+db,'-X','-qAt','-v','ON_ERROR_STOP=1',data=text.encode())
    if expected:
        if r.returncode:
            error=r.stderr.lower()
            category=next((name for needle,name in [(b'does not exist','UNDEFINED_OBJECT'),
                (b'permission denied','PERMISSION_DENIED'),(b'must be owner','OWNERSHIP_REQUIRED'),
                (b'violates','CONSTRAINT'),(b'canonical_fence_preflight_mismatch','FENCE_PREFLIGHT_MISMATCH')]
                if needle in error),'OTHER')
            raise AssertionError('ISOLATED_SQL_'+category)
    return r

def main():
    os.umask(0o077)
    assert len(pathlib.Path('/proc/swaps').read_text().splitlines()) == 1, 'HOST_SWAP_REFUSED'
    assert not os.environ.get('DOCKER_HOST'), 'REMOTE_DOCKER_REFUSED'
    context = cmd(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}'])
    assert context.stdout.strip() == b'unix:///var/run/docker.sock', 'DOCKER_HOST_UNVERIFIED'
    assert shutil.disk_usage(HOME).free > 128*1024**2, 'INSUFFICIENT_CIPHERTEXT_SPACE'
    assert docker('image','inspect',IMAGE).returncode == 0, 'PINNED_IMAGE_REQUIRED'
    assert not META.exists(), 'DO_NOT_RESTART_EXISTING_TEST'
    assert docker('inspect',NAME).returncode != 0, 'EXISTING_CONTAINER_PRESERVED'
    for file, digest in HASHES.items():
        assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest() == digest, 'DRAFT_HASH_MISMATCH'
    fresh='--fresh' in sys.argv
    source = json.loads((ROOT/'fresh-backup-input.json' if fresh else HOME/'xroga-google-migration-backup-receipt-20261027-v4.json').read_text())
    prefix=source['prefix']
    assert source['status']=='PASS_ENCRYPTED_PRODUCTION_BACKUP_NOT_YET_RESTORED', 'BACKUP_RECEIPT_MISMATCH'
    if fresh:
        assert re.fullmatch(r'gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20\d{6}T\d{6}Z/',prefix), 'FRESH_BACKUP_DESTINATION_MISMATCH'
        assert source.get('readOnlyPreflight',{}).get('enqueueMd5')=='9014766f51e6d9fd878cc5d4724383c2', 'FRESH_BACKUP_PREFLIGHT_REQUIRED'
    else:
        assert prefix==PREFIX, 'RETAINED_BACKUP_IDENTITY_MISMATCH'
    assert source['project']=='nzenxdfumxrnsmybazmo' and source['dumpDataFormat']=='INSERT', 'BACKUP_IDENTITY_MISMATCH'
    state={'startedAtUtc':now(),'productionSqlApplied':False,'productionConnections':False,
           'customerProviderDispatch':False,'backupPrefix':prefix,'freshBackup':fresh,'draftHashes':HASHES,'stages':[]}
    def mark(stage):
        state['stages'].append(stage)
        RECEIPT.write_text(json.dumps(state,indent=2)+'\n')
        print(stage,flush=True)
    mark('NO_SWAP_LOCAL_DOCKER_AND_EXACT_DRAFT_HASHES_PASS')
    cipher = ROOT/'ciphertext'
    cipher.mkdir(mode=0o700)
    for file in ['database.dump.gpg','roles.sql.gpg','backup-secret.kms']:
        item=next(v for v in source['encryptedFiles'] if v['name']==file)
        target=cipher/file
        meta=cmd(['gcloud','storage','objects','describe',prefix+file,'--format=json','--quiet'])
        assert meta.returncode==0,'BACKUP_METADATA_ACCESS_FAILED'
        metadata=json.loads(meta.stdout)
        assert int(metadata['size'])==item['bytes'],'BACKUP_OBJECT_SIZE_MISMATCH'
        if file=='database.dump.gpg' and not fresh:
            assert str(metadata['generation'])=='1793086727267501','BACKUP_GENERATION_MISMATCH'
            assert int(metadata['size'])==12581025,'BACKUP_SIZE_MISMATCH'
        if file=='database.dump.gpg':state['databaseObjectGeneration']=str(metadata['generation'])
        fetched=cmd(['gcloud','storage','cp',prefix+file+'#'+str(metadata['generation']),str(target),'--quiet'])
        assert fetched.returncode==0,'ENCRYPTED_BACKUP_FETCH_FAILED'
        assert target.stat().st_size==item['bytes'],'CIPHERTEXT_SIZE_MISMATCH'
        assert hashlib.sha256(target.read_bytes()).hexdigest()==item['sha256'],'CIPHERTEXT_HASH_MISMATCH'
    mark('PINNED_ENCRYPTED_BACKUP_GENERATION_AND_HASHES_PASS')
    job=str(uuid.uuid4())
    META.write_text(json.dumps({'jobId':job,'deadline':time.time()+35*60,'createdAtUtc':now()}))
    subprocess.Popen([sys.executable,str(pathlib.Path(__file__).resolve()),'--watch'],
                     stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    secret=None
    try:
        r=docker('run','-d','--rm','--name',NAME,'--network','none','--memory','1g','--memory-swap','1g','--cpus','1',
            '--log-driver','none','--label','io.xroga.cleanup.owner='+OWNER,'--label','io.xroga.cleanup.job='+job,
            '--label','io.xroga.cleanup.disposable=true',
            '--tmpfs','/var/lib/postgresql/data:rw,nosuid,noexec,size=512m,mode=0700',
            '--tmpfs','/var/run/postgresql:rw,nosuid,noexec,size=32m,mode=0777',
            '--tmpfs','/var/log/postgresql:rw,nosuid,noexec,size=32m,mode=0777',
            '--env','POSTGRES_PASSWORD=synthetic-isolated-restore-only','--env','POSTGRES_DB='+DB,
            IMAGE,'postgres','-D','/etc/postgresql','-c','cron.launch_active_jobs=off','-c','logging_collector=off',
            '-c','log_min_error_statement=panic','-c','log_error_verbosity=terse')
        assert r.returncode==0,'ISOLATED_CONTAINER_CREATION_FAILED'
        owned(json.loads(docker('inspect',NAME).stdout)[0],job)
        assert docker('exec',NAME,'cat','/proc/swaps').stdout.count(b'\n')==1,'DAEMON_KERNEL_SWAP_REFUSED'
        for _ in range(60):
            if docker('exec',NAME,'pg_isready','--host=127.0.0.1','--username=supabase_admin','--dbname='+DB).returncode==0:break
            time.sleep(1)
        else:raise AssertionError('POSTGRES_STARTUP_FAILED')
        sql("CREATE ROLE "+ADMIN+" LOGIN SUPERUSER PASSWORD 'synthetic-isolated-restore-only';",user='supabase_admin')
        assert sql('SHOW data_directory;').stdout.strip().startswith(b'/var/lib/postgresql/data'), 'NON_TMPFS_DATA_DIRECTORY'
        mark('NETWORK_NONE_TMPFS_NO_LOGS_NO_SWAP_CONTAINER_PASS')
        sys.path.insert(0,str(HOME))
        from verified_restore_stream import consume_verified_output
        result=cmd(['gcloud','kms','decrypt','--key=xroga-production-backups','--keyring=xroga-p3-verify-20261023',
                    '--location=us-central1','--project=project-c40d4821-e647-4fa2-92d',
                    '--ciphertext-file='+str(cipher/'backup-secret.kms'),'--plaintext-file=-','--quiet'])
        assert result.returncode==0,'BACKUP_KMS_ACCESS_FAILED'
        secret=bytearray(result.stdout)
        del result
        def decrypt(file,consume):
            a,b=os.pipe()
            os.write(b,secret+b'\n');os.close(b)
            try:
                return consume_verified_output(['gpg','--batch','--pinentry-mode','loopback','--no-symkey-cache',
                    '--passphrase-fd',str(a),'--decrypt',str(cipher/file)],consume,pass_fds=(a,),limit=256*1024**2,timeout=120)
            finally:os.close(a)
        existing=set(json.loads(sql('SELECT json_agg(rolname) FROM pg_roles;').stdout))
        def roles(data):
            kept=[]
            for line in bytes(data).decode().splitlines():
                m=re.fullmatch(r'CREATE ROLE (.+);',line)
                if m:
                    role=m[1]
                    role=role[1:-1].replace('""','"') if role.startswith('"') else role
                    if role in existing:continue
                kept.append(line)
            sql('\n'.join(kept)+'\n')
        decrypt('roles.sql.gpg',roles)
        sql('DROP DATABASE '+DB+' WITH (FORCE);',db='postgres')
        sql('CREATE DATABASE '+DB+' OWNER postgres TEMPLATE template0;',db='postgres')
        def restore(data):
            toc=docker('exec','-i',NAME,'pg_restore','--list',data=data)
            assert toc.returncode==0,'AUTHENTICATED_DUMP_LIST_FAILED'
            lines=toc.stdout.decode().splitlines()
            events=[x for x in lines if ' EVENT TRIGGER ' in x]
            assert len(events)==7,'EVENT_TRIGGER_SHAPE_CHANGED'
            for label,selected in [('main',[x for x in lines if ' EVENT TRIGGER ' not in x]),('events',events)]:
                path='/var/run/postgresql/'+label+'.list'
                assert docker('exec','-i',NAME,'sh','-c','umask 077; cat > '+path,data=('\n'.join(selected)+'\n').encode()).returncode==0,'RAM_TOC_WRITE_FAILED'
                args=['exec','-i','--env','PGPASSWORD=synthetic-isolated-restore-only',NAME,'pg_restore',
                      '--host=127.0.0.1','--username='+ADMIN,'--dbname='+DB,'--exit-on-error','--use-list='+path]
                args+=['--clean','--if-exists'] if label=='main' else ['--use-set-session-authorization']
                restored=docker(*args,data=data,timeout=300)
                assert restored.returncode==0,'RESTORE_'+label.upper()+'_FAILED'
            return {'authenticatedDumpBytes':len(data),'eventTriggerCount':len(events)}
        state['restore']=decrypt('database.dump.gpg',restore)
        secret[:]=b'\0'*len(secret)
        mark('FULL_BACKUP_ROLES_DATABASE_OWNERS_ACLS_RESTORED')
        shape=json.loads(sql("SELECT json_build_object('deliveryTable',to_regclass('public.google_canonical_deliveries') IS NOT NULL,'enqueue',to_regprocedure('public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)') IS NOT NULL);").stdout)
        state['retainedSnapshotCanonicalObjects']=shape
        if fresh:assert all(shape.values()),'FRESH_BACKUP_CANONICAL_SCHEMA_MISSING'
        if shape=={'deliveryTable':False,'enqueue':False}:
            # This fixture predates the already released Google transport SQL.
            # Reproduce that exact expansion only in the isolated restored DB.
            sql('SET ROLE postgres; '+(ROOT/'released-google-canonical-deliveries.sql').read_text())
            mark('RELEASED_TRANSPORT_EXPANSION_APPLIED_ONLY_TO_OLD_ISOLATED_FIXTURE')
        else:
            assert all(shape.values()),'PARTIAL_CANONICAL_SCHEMA_REFUSED'
        original=sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure;").stdout.strip().decode()
        state['restoredEnqueueMd5']=original
        assert original=='9014766f51e6d9fd878cc5d4724383c2','RETAINED_SCHEMA_REQUIRES_RELEASED_COMPATIBILITY_UPGRADE'
        assert sql("SELECT NOT rolsuper AND rolbypassrls FROM pg_roles WHERE rolname='postgres';").stdout.strip()==b't','PRODUCTION_POSTGRES_ROLE_SHAPE_MISMATCH'
        sql('SET ROLE postgres; '+(ROOT/'cutover-fence-upgrade.DRAFT.sql').read_text())
        mark('EXACT_FENCE_UPGRADE_ON_FULL_RESTORE_PASS')
        exercise_fence(sql,mark)
        state['status']='PASS_ISOLATED_FULL_RESTORE_FENCE_AND_ROLLBACK_NOT_PRODUCTION_ACCEPTANCE'
    except Exception as e:
        state['status']='BLOCKED_ISOLATED_RESTORE_OR_FENCE'
        state['errorCategory']=str(e) if isinstance(e,AssertionError) else type(e).__name__
    finally:
        if isinstance(secret,bytearray):secret[:]=b'\0'*len(secret)
        cleanup(job)
        state['cleanupVerified']=True
        state['completedAtUtc']=now()
        RECEIPT.write_text(json.dumps(state,indent=2)+'\n')
        print(json.dumps(state),flush=True)

def exercise_fence(sql,mark):
    # Use new synthetic identities only. Never inspect or change customer rows.
    owner,project,foreign=[str(uuid.uuid4()) for _ in range(3)]
    sql(f"INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES ('{owner}','authenticated','authenticated','fence-{owner}@example.invalid','{{}}','{{}}'); INSERT INTO public.projects(id,user_id,name,type) VALUES('{project}','{owner}','isolated fence fixture','app');")
    deliveries=[]
    runs=[]
    def enqueue(source=OLD,user=owner):
        d,r=str(uuid.uuid4()),str(uuid.uuid4())
        deliveries.append(d);runs.append(r)
        return "SET ROLE service_role; SELECT public.enqueue_google_canonical_run('"+d+"','"+r+"','"+user+"','"+project+"','{\"prompt\":\"isolated synthetic fence test\"}','"+source+"');"
    first=enqueue()
    pause='SET ROLE postgres; '+(ROOT/'cutover-pause.sql').read_text()
    allow_new='SET ROLE postgres; '+(ROOT/'cutover-allow-85.sql').read_text()
    allow_old='SET ROLE postgres; '+(ROOT/'cutover-allow-ca94.sql').read_text()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        admission=pool.submit(sql,'BEGIN; '+first+' SELECT pg_sleep(3); COMMIT;')
        for _ in range(60):
            held=sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND mode='ShareLock' AND granted;").stdout.strip()
            if int(held)>0:break
            time.sleep(.05)
        else:raise AssertionError('INFLIGHT_ADMISSION_NOT_OBSERVED')
        started=time.monotonic()
        sql(pause)
        elapsed=time.monotonic()-started
        admission.result()
        assert elapsed>1.5,'FENCE_DID_NOT_DRAIN_INFLIGHT_ADMISSION'
    mark('FULL_RESTORE_FENCE_WAITS_FOR_INFLIGHT_ADMISSION_PASS')
    assert sql(first,expected=False).returncode!=0,'PAUSED_REPLAY_ADMITTED'
    assert sql("SET ROLE service_role; UPDATE public.xroga_release_fence SET allowed_source='"+NEW+"';",expected=False).returncode!=0,'SERVICE_ROLE_MODIFIED_GATE'
    for role in ['anon','authenticated']:
        assert sql('SET ROLE '+role+'; SELECT * FROM public.xroga_release_fence;',expected=False).returncode!=0,'UNPRIVILEGED_GATE_READ'
    assert sql(allow_new,expected=False).returncode!=0,'FORWARD_OPEN_WITH_OLD_ACTIVE_WORK_ACCEPTED'
    assert sql(allow_old,expected=False).returncode!=0,'RECOVERY_OPEN_WITH_ACTIVE_WORK_ACCEPTED'
    sql("UPDATE public.swarm_runs SET status='complete' WHERE id='"+runs[0]+"';")
    sql(allow_new)
    mark('EXACT_SOURCE_TRANSITION_SQL_REQUIRES_PAUSE_AND_FULL_DRAIN_PASS')
    assert sql(enqueue(),expected=False).returncode!=0,'OLD_SOURCE_ADMITTED'
    sql(enqueue(NEW))
    assert sql(enqueue(NEW,foreign),expected=False).returncode!=0,'FOREIGN_OWNER_ADMITTED'
    mark('FULL_RESTORE_PAUSE_SOURCE_TENANT_AND_GATE_PRIVILEGES_PASS')
    rollback='SET ROLE postgres; '+(ROOT/'cutover-fence-rollback.DRAFT.sql').read_text()
    assert sql(rollback,expected=False).returncode!=0,'ROLLBACK_WITH_OPEN_GATE_ACCEPTED'
    sql(pause)
    assert sql(rollback,expected=False).returncode!=0,'ROLLBACK_WITH_ACTIVE_WORK_ACCEPTED'
    ids=','.join("'"+r+"'" for r in runs)
    sql('UPDATE public.swarm_runs SET status=\'complete\' WHERE id IN ('+ids+');')
    sql(allow_old)
    assert sql(enqueue(NEW),expected=False).returncode!=0,'RECOVERY_GATE_ADMITTED_NEW_SOURCE'
    sql(enqueue(OLD))
    sql("UPDATE public.swarm_runs SET status='complete' WHERE id='"+runs[-1]+"';")
    sql(pause)
    mark('EXACT_CA94_RECOVERY_GATE_SOURCE_AND_DRAIN_PASS')
    # Existing snapshot work is never force-completed to make rollback pass.
    assert sql(rollback,expected=False).returncode==0,'RESTORED_SNAPSHOT_HAS_UNDRAINED_WORK_ROLLBACK_REFUSED'
    assert sql("SELECT md5(prosrc)='9014766f51e6d9fd878cc5d4724383c2' AND to_regclass('public.xroga_release_fence') IS NULL FROM pg_proc WHERE oid='public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure;").stdout.strip()==b't','ROLLBACK_DID_NOT_RESTORE_EXACT_ORIGINAL'
    mark('FULL_RESTORE_GUARDED_ROLLBACK_EXACT_FUNCTION_PASS')

if __name__=='__main__':
    if '--watch' in sys.argv:
        meta=json.loads(META.read_text())
        while time.time()<meta['deadline'] and not DONE.exists():time.sleep(5)
        if not DONE.exists():cleanup(meta['jobId'])
    else:main()
