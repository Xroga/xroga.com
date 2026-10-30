"""Owner Cloud Shell only, protected credentials, explicit rollback verification."""
import datetime,hashlib,json,os,pathlib,subprocess,urllib.parse
HOME=pathlib.Path.home();ROOT=pathlib.Path(__file__).resolve().parent
P='project-c40d4821-e647-4fa2-92d'
assert len(pathlib.Path('/proc/swaps').read_text().splitlines())==1,'NO_SWAP_HOST_REQUIRED'
sql=(ROOT/'accounting-verification-rollback.sql').read_bytes()
assert b'ROLLBACK;' in sql and b'COMMIT;' not in sql,'ROLLBACK_ONLY_TEST_REQUIRED'
r=subprocess.run(['gcloud','secrets','versions','access','3','--secret=xroga-platform-production','--project='+P,'--quiet'],capture_output=True,timeout=45)
assert r.returncode==0,'PROTECTED_CONFIG_UNAVAILABLE'
config=json.loads(r.stdout);del r
assert config['target']=='xroga-api-google' and config['schemaVersion']==1
u=urllib.parse.urlsplit(config['environment']['DATABASE_URL'])
assert 'nzenxdfumxrnsmybazmo' in (u.hostname or '') or 'nzenxdfumxrnsmybazmo' in urllib.parse.unquote(u.username or '')
port=5432 if u.port==6543 else (u.port or 5432)
fd=os.memfd_create('xroga-accounting-pgpass',os.MFD_CLOEXEC);os.fchmod(fd,0o600)
escape=lambda value:str(value).replace('\\','\\\\').replace(':','\\:')
os.write(fd,(':'.join(map(escape,[u.hostname,port,u.path.lstrip('/') or 'postgres',urllib.parse.unquote(u.username or ''),urllib.parse.unquote(u.password or '')]))+'\n').encode());os.lseek(fd,0,0)
env=os.environ.copy();env.update(PGHOST=u.hostname,PGPORT=str(port),PGUSER=urllib.parse.unquote(u.username or ''),PGDATABASE=u.path.lstrip('/') or 'postgres',PGPASSFILE='/proc/self/fd/'+str(fd),PGSSLMODE='verify-full',PGSSLROOTCERT=str(HOME/'xroga-p3-supabase-ca.crt'),PGCONNECT_TIMEOUT='15',PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=20000',PGAPPNAME='xroga_batch1_rollback_only_accounting_verification')
try:
 # Plain SQL protocol verification does not need the version-matched pg_dump
 # binary used for backup. Use Cloud Shell's existing vendor psql client.
 assert pathlib.Path('/usr/bin/psql').is_file(),'SYSTEM_PSQL_REQUIRED'
 result=subprocess.run(['/usr/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','--no-password'],input=sql,env=env,pass_fds=(fd,),capture_output=True,timeout=60)
 assert result.returncode==0,'PRODUCTION_ACCOUNTING_VERIFICATION_FAILED'
 assert result.stdout.strip()==b'PASS_ZERO_COST_ACCOUNTING_POSITIVE_REPLAY_CONFLICT_OWNER_DENIAL_ROLLED_BACK','ACCOUNTING_RECEIPT_UNVERIFIED'
 receipt={'status':'PASS_ROLLBACK_ONLY_PRODUCTION_ACCOUNTING','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'cases':['valid_zero_cost_receipt','same_receipt_idempotent_replay','changed_evidence_denial','unknown_owner_denial','test_receipt_absent_after_rollback'],
  'sqlSha256':hashlib.sha256(sql).hexdigest(),'modelCalls':0,'chargedUsd':0,'testWritesRolledBack':True,'credentialsPersisted':False}
 (ROOT/'accounting-rollback-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
finally:
 os.close(fd);config.clear()
