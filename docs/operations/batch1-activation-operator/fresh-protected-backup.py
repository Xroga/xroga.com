"""Fresh read-only backup through existing Google custody, no production SQL.

Credentials exist only in the verified no-swap owner Cloud Shell process and an
anonymous pgpass memfd. Reuse the previously reviewed authenticated stream,
encrypted backup and private credential-object backup implementation.
"""
import base64, hashlib, importlib.util, json, os, pathlib, signal
import subprocess, sys, urllib.parse

HOME=pathlib.Path.home()
ROOT=pathlib.Path(__file__).resolve().parent
P='project-c40d4821-e647-4fa2-92d'
REF='nzenxdfumxrnsmybazmo'
os.umask(0o077)
os.environ['CLOUDSDK_CORE_ACCOUNT']='mabdullah.built@gmail.com'
assert len(pathlib.Path('/proc/swaps').read_text().splitlines())==1,'NO_SWAP_HOST_REQUIRED'
assert hashlib.sha256((ROOT/'protected_backup_library.py').read_bytes()).hexdigest()=='6ce9006246c9ee14f7d2d74793fd67e60aa0599c951b9e18f96fe2c639a57184','BACKUP_LIBRARY_DRIFT'
assert hashlib.sha256((HOME/'verified_restore_stream.py').read_bytes()).hexdigest()=='3a015d04e86e8e51a517e58ad0f6d6962e9b5bcba2d777932f5533fe1ba2f13c','VERIFIED_STREAM_DRIFT'
assert (HOME/'xroga-p3-supabase-ca.crt').is_file(),'RETAINED_SUPABASE_CA_REQUIRED'
assert pathlib.Path('/usr/lib/postgresql/17/bin/pg_dump').is_file(),'PG17_CLIENT_REQUIRED'
assert not (ROOT/'fresh-protected-backup-receipt.json').exists(),'DO_NOT_REPEAT_EXISTING_BACKUP'
signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError('PROTECTED_BACKUP_DEADLINE')))
signal.alarm(1200)
sys.path.insert(0,str(HOME))
spec=importlib.util.spec_from_file_location('reviewed_backup',ROOT/'protected_backup_library.py')
library=importlib.util.module_from_spec(spec)
spec.loader.exec_module(library)
library.BASE=HOME/'xroga-batch1-production-recovery'/'backup'

raw=library.gc(['secrets','versions','access','3','--secret=xroga-platform-production'])
bundle=json.loads(raw)
del raw
assert bundle['schemaVersion']==1 and bundle['target']=='xroga-api-google','CONFIG_IDENTITY_MISMATCH'
values=bundle['environment']
url=values.get('SUPABASE_URL','').rstrip('/')
assert url=='https://'+REF+'.supabase.co','SUPABASE_TARGET_MISMATCH'
service=values['SUPABASE_SERVICE_ROLE_KEY']
claims=json.loads(base64.urlsafe_b64decode(service.split('.')[1]+'=='))
assert claims['role']=='service_role' and claims['ref']==REF,'SERVICE_CREDENTIAL_SCOPE_MISMATCH'
dburl=values['DATABASE_URL']
u=urllib.parse.urlsplit(dburl)
assert u.scheme in ['postgres','postgresql'] and (REF in (u.hostname or '') or REF in urllib.parse.unquote(u.username or '')),'DATABASE_TARGET_MISMATCH'
seed=values.get('USER_SECRETS_ENCRYPTION_KEY') or service or values.get('SUPABASE_JWT_SECRET')
derived=hashlib.scrypt(seed[:64].encode('ascii'),salt=b'xroga-provider-keys-v2',n=16384,r=8,p=1,dklen=32)
config={'sourceSha':'ca94c2f8a813524e47f5f7abc868acb1618a1c45','databaseUrl':dburl,'supabaseUrl':url,
        'serviceRole':service,'legacyDerivedKey':base64.b64encode(derived).decode()}
values.clear();bundle.clear()
del seed,derived,service,dburl

def db_env():
    parsed=urllib.parse.urlsplit(config['databaseUrl'])
    host=parsed.hostname
    user=urllib.parse.unquote(parsed.username or '')
    password=urllib.parse.unquote(parsed.password or '')
    db=parsed.path.lstrip('/') or 'postgres'
    port=5432 if parsed.port==6543 else (parsed.port or 5432)
    fd=os.memfd_create('xroga-batch1-backup-pgpass',os.MFD_CLOEXEC)
    os.fchmod(fd,0o600)
    escape=lambda value:str(value).replace('\\','\\\\').replace(':','\\:')
    os.write(fd,(':'.join(map(escape,[host,port,db,user,password]))+'\n').encode())
    os.lseek(fd,0,0)
    env=os.environ.copy()
    env.update(PGHOST=host,PGPORT=str(port),PGUSER=user,PGDATABASE=db,PGPASSFILE='/proc/self/fd/'+str(fd),
        PGSSLMODE='verify-full',PGSSLROOTCERT=str(HOME/'xroga-p3-supabase-ca.crt'),PGCONNECT_TIMEOUT='15',
        PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000')
    return env,fd

def run_pg(program,args):
    env,fd=db_env()
    try:
        return subprocess.run(['/usr/lib/postgresql/17/bin/'+program,*args],env=env,pass_fds=(fd,),
            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
    finally:os.close(fd)

try:
    # Bound identity, TLS and read-only checks before any data export.
    pre=run_pg('psql',['-X','-qAt','--no-password','-c',"BEGIN READ ONLY; SELECT json_build_object('readOnly',current_setting('transaction_read_only'),'serverMajor',current_setting('server_version_num')::int/10000,'enqueueMd5',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure)); COMMIT;"])
    assert pre.returncode==0,'READ_ONLY_TLS_DATABASE_PREFLIGHT_FAILED'
    result=json.loads(pre.stdout)
    assert result=={'readOnly':'on','serverMajor':17,'enqueueMd5':'9014766f51e6d9fd878cc5d4724383c2'},'DATABASE_COMPATIBILITY_DRIFT'
    print('PASS_READ_ONLY_TLS_AND_CURRENT_SCHEMA_PREFLIGHT',flush=True)
    receipt=library.perform_backup(config,run_pg,db_env)
    receipt['operatorSource']='fresh-protected-backup.py'
    receipt['readOnlyPreflight']=result
    receipt['noNewCloudResource']=True
    (ROOT/'fresh-protected-backup-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt),flush=True)
finally:
    config.clear()
    signal.alarm(0)
