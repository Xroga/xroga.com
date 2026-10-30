"""Protected production backup. Called only inside the RAM credential operator."""
import os,json,pathlib,subprocess,base64,secrets as secure,hashlib,datetime,urllib.request,urllib.parse,io,tarfile
from verified_restore_stream import consume_verified_output
P='project-c40d4821-e647-4fa2-92d';KEY='xroga-production-backups';R='us-central1';RING='xroga-p3-verify-20261023';BUCKET='gs://xroga-p3-prod-recovery-574998934848';PROJECT='nzenxdfumxrnsmybazmo'
BASE=pathlib.Path('/home/mabdullah_built/xroga-google-migration-recovery/backup')
def gc(args,inp=None):
 r=subprocess.run(['gcloud',*args,'--project='+P,'--quiet'],input=inp,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
 if r.returncode:raise RuntimeError('Approved cloud operation failed: '+args[0]+' '+args[1])
 return r.stdout

def secret_fd(secret):
 a,b=os.pipe();os.write(b,secret+b'\n');os.close(b);return a

def seal(data,out,secret):
 fd=secret_fd(secret)
 try:
  r=subprocess.run(['gpg','--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd',str(fd),'--symmetric','--cipher-algo','AES256','--force-mdc','--compress-algo','none','--output',str(out)],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=(fd,),timeout=180)
  if r.returncode:raise RuntimeError('Protected encryption failed')
 finally:os.close(fd)

def decrypt(out,secret,consume):
 fd=secret_fd(secret)
 try:return consume_verified_output(['gpg','--batch','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd',str(fd),'--decrypt',str(out)],consume,pass_fds=(fd,),limit=256*1024*1024,timeout=120)
 finally:os.close(fd)

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def perform_backup(config,run_pg,db_env):
 os.umask(0o077);BASE.mkdir(parents=True,exist_ok=True,mode=0o700)
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');work=BASE/stamp;work.mkdir(mode=0o700)
 prefix=BUCKET+'/google-migration-20261026/'+stamp+'/'
 state={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'project':PROJECT,'prefix':prefix,'workDir':str(work),'stages':[],'productionSqlApplied':False,'customerProviderDispatch':False,'dumpDataFormat':'INSERT'}
 def mark(x):state['stages'].append(x);(work/'redacted-receipt.json').write_text(json.dumps(state,indent=2))
 def pgjson(sql):
  r=run_pg('psql',['-X','-q','-A','-t','--no-password','-c','BEGIN READ ONLY;'+sql+'COMMIT;'])
  if r.returncode:raise RuntimeError('Protected catalog query failed')
  return json.loads(r.stdout)
 try:
  secret=secure.token_urlsafe(48).encode();wrapped=work/'backup-secret.kms';gc(['kms','encrypt','--key='+KEY,'--keyring='+RING,'--location='+R,'--plaintext-file=-','--ciphertext-file='+str(wrapped)],secret)
  unwrapped=gc(['kms','decrypt','--key='+KEY,'--keyring='+RING,'--location='+R,'--ciphertext-file='+str(wrapped),'--plaintext-file=-']);assert unwrapped==secret;del unwrapped
  test=work/'synthetic-transport.gpg';payload=b'XROGA_APPROVED_PRODUCTION_BACKUP_TRANSPORT_ONLY';seal(payload,test,secret)
  gc(['storage','cp',str(test),prefix+test.name]);gc(['storage','cp',prefix+test.name,str(work/'synthetic-retrieved.gpg')]);assert sha(test)==sha(work/'synthetic-retrieved.gpg');assert decrypt(work/'synthetic-retrieved.gpg',secret,lambda x:bytes(x)==payload)
  gc(['storage','cp',str(wrapped),prefix+wrapped.name]);mark('ACTUAL_BACKUP_KEY_WRAP_UNWRAP_PRIVATE_UPLOAD_RETRIEVAL_HASH_DECRYPT_PASS')
  md=pgjson("SELECT json_build_object('version_num',current_setting('server_version_num'),'transaction_read_only',current_setting('transaction_read_only'),'database_bytes',pg_database_size(current_database()),'vault_rows',(SELECT count(*) FROM vault.secrets),'extensions',(SELECT json_agg(json_build_object('name',extname,'version',extversion)) FROM pg_extension));")
  assert md['transaction_read_only']=='on','Explicit backup read-only transaction missing'
  assert md['vault_rows']==0,'Unescrowed platform vault material exists';state['metadata']=md
  # Every private object identifier remains only in RAM and the encrypted manifest.
  objsql="SELECT COALESCE(json_agg(json_build_object('name',name,'id',id,'updated_at',updated_at,'metadata',metadata) ORDER BY name),'[]'::json) FROM storage.objects WHERE bucket_id='xroga-github-tokens';"
  before=pgjson(objsql)
  headers={'Authorization':'Bearer '+config['serviceRole'],'apikey':config['serviceRole']}
  def fetch(path):
   if path.startswith('/storage/v1/object/'): path+=('&' if '?' in path else '?')+'cacheNonce='+secure.token_hex(12)
   with urllib.request.urlopen(urllib.request.Request(config['supabaseUrl']+path,headers=headers),timeout=30) as r:
    content=r.read(2*1024*1024+1)
    if len(content)>2*1024*1024:raise RuntimeError('Private object size outside bound')
    return content,dict(r.headers)
  bucket=json.loads(fetch('/storage/v1/bucket/xroga-github-tokens')[0]);assert bucket.get('id')=='xroga-github-tokens' and bucket.get('public') is False
  archive=io.BytesIO();object_manifest=[]
  with tarfile.open(fileobj=archive,mode='w') as tar:
   for i,obj in enumerate(before):
    name=obj['name'];assert name and not name.startswith('/') and '..' not in name.split('/')
    body,h=fetch('/storage/v1/object/authenticated/xroga-github-tokens/'+urllib.parse.quote(name,safe='/'))
    member='object-'+str(i).zfill(6)+'.bin';ti=tarfile.TarInfo(member);ti.size=len(body);ti.mode=0o600;tar.addfile(ti,io.BytesIO(body))
    object_manifest.append({'object':obj,'archiveMember':member,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'etag':h.get('ETag')})
    del body
  assert pgjson(objsql)==before,'Private objects changed during archive capture'
  seal(archive.getvalue(),work/'credential-objects.tar.gpg',secret);archive.close();mark('PRIVATE_CREDENTIAL_OBJECTS_ENCRYPTED_STABLE_METADATA')
  # Preserve the exact source-derived legacy key, not the broader service-role token.
  seal(json.dumps({'source':config['sourceSha'],'project':PROJECT,'algorithm':'scrypt(secret.slice(0,64),xroga-provider-keys-v2,32)','derivedKeyBase64':config['legacyDerivedKey']}).encode(),work/'legacy-key-escrow.gpg',secret)
  roles=run_pg('pg_dumpall',['--roles-only','--no-role-passwords','--no-password']);assert roles.returncode==0,'Role inventory failed';seal(roles.stdout,work/'roles.sql.gpg',secret);del roles
  dbfile=work/'database.dump.gpg';env,fd=db_env();passfd=secret_fd(secret)
  try:
   dump=subprocess.Popen(['/usr/lib/postgresql/17/bin/pg_dump','--format=custom','--inserts','--no-password','--lock-wait-timeout=3s'],env=env,pass_fds=(fd,),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   enc=subprocess.Popen(['gpg','--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd',str(passfd),'--symmetric','--cipher-algo','AES256','--force-mdc','--compress-algo','none','--output',str(dbfile)],stdin=dump.stdout,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,pass_fds=(passfd,));dump.stdout.close();_,encrypt_error=enc.communicate(timeout=600);_,dump_error=dump.communicate(timeout=30)
   if enc.returncode!=0 or dump.returncode!=0:
    seal(json.dumps({'pgDumpExit':dump.returncode,'encryptExit':enc.returncode,'pgDumpStderrBase64':base64.b64encode(dump_error).decode(),'encryptStderrBase64':base64.b64encode(encrypt_error).decode()}).encode(),work/'dump-diagnostics.json.gpg',secret)
    state['dumpFailure']={'pgDumpExit':dump.returncode,'encryptExit':enc.returncode,'category':diagnostic_category(dump_error),'encryptedDiagnostic':'dump-diagnostics.json.gpg'}
    mark('FULL_DUMP_DIAGNOSTICS_ENCRYPTED_NO_RAW_ERROR_OUTPUT')
   assert enc.returncode==0 and dump.returncode==0,'Database encrypted stream failed'
  finally:os.close(fd);os.close(passfd)
  assert pgjson(objsql)==before,'Private object set changed across database snapshot'
  # Verify full integrity before allowing any decrypted bytes into pg_restore.
  def verify_dump(data):
   result=subprocess.run(['/usr/lib/postgresql/17/bin/pg_restore','--list'],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
   if result.returncode:raise RuntimeError('Authenticated dump structure failed')
   return {'customDumpBytes':len(data),'tocSha256':hashlib.sha256(result.stdout).hexdigest(),'tocEntries':len([x for x in result.stdout.splitlines() if x and not x.startswith(b';')])}
  state['dumpVerification']=decrypt(dbfile,secret,verify_dump);state['privateObjectCount']=len(before);mark('ENCRYPTED_PRODUCTION_DATABASE_AUTHENTICATED_AND_PG_RESTORE_LIST_PASS')
  manifest={'sourceProject':PROJECT,'objectManifest':object_manifest,'sourceMetadata':md,'captureStartedAt':state['startedAt'],'captureFinishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'objectsStableAcrossSnapshot':True}
  seal(json.dumps(manifest).encode(),work/'private-object-manifest.json.gpg',secret);del object_manifest,before
  encrypted=sorted(work.glob('*.gpg'));total=sum(f.stat().st_size for f in encrypted)+wrapped.stat().st_size;assert total<=1024**3,'Encrypted set exceeds approved1GiB'
  state['encryptedFiles']=[{'name':f.name,'bytes':f.stat().st_size,'sha256':sha(f)} for f in encrypted]+[{'name':wrapped.name,'bytes':wrapped.stat().st_size,'sha256':sha(wrapped)}]
  for f in encrypted:gc(['storage','cp',str(f),prefix+f.name])
  retrieve=work/'database-retrieved.gpg';gc(['storage','cp',prefix+dbfile.name,str(retrieve)]);assert sha(retrieve)==sha(dbfile);state['retrievedDumpVerification']=decrypt(retrieve,secret,verify_dump)
  assert state['retrievedDumpVerification']==state['dumpVerification'];state['status']='PASS_ENCRYPTED_PRODUCTION_BACKUP_NOT_YET_RESTORED';mark('DURABLE_ENCRYPTED_SET_AND_INDEPENDENT_RETRIEVED_DATABASE_VERIFIED')
  state['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(work/'redacted-receipt.json').write_text(json.dumps(state,indent=2));gc(['storage','cp',str(work/'redacted-receipt.json'),prefix+'redacted-receipt.json']);del secret
  return state
 except Exception as e:
  state['status']='STOP_BACKUP_GATE';state['errorType']=type(e).__name__;state['errorStage']=str(e) if str(e).startswith(('Unescrowed','Private object','Protected','Approved','Database','Role','Encrypted','Authenticated')) else 'Protected backup operation failed';(work/'redacted-receipt.json').write_text(json.dumps(state,indent=2));return state


def diagnostic_category(data):
 text=bytes(data).decode(errors='replace').lower()
 for needle,category in [
  ('permission denied','DB_PERMISSION_DENIED'),
  ('row-level security','DB_ROW_SECURITY_DENIED'),
  ('server version mismatch','SERVER_CLIENT_VERSION_MISMATCH'),
  ('unrecognized configuration parameter','SERVER_CLIENT_PARAMETER_UNSUPPORTED'),
  ('password authentication failed','DB_AUTH_FAILED'),
  ('certificate verify failed','DB_TLS_FAILED'),
  ('connection','DB_CONNECTION_FAILED'),
  ('could not translate host name','DB_DNS_FAILED'),
  ('unrecognized command','CLIENT_COMMAND_UNSUPPORTED'),
 ]:
  if needle in text:return category
 return 'PROTECTED_UNKNOWN_DUMP_ERROR'

def perform_dump_preflight(config,run_pg):
 result=run_pg('pg_dump',['--schema-only','--no-password','--lock-wait-timeout=3s'])
 receipt={'sourceSha':config['sourceSha'],'exitCode':result.returncode,'productionSqlApplied':False,'customerRowsExported':False,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if result.returncode==0:
  receipt.update(status='PASS_SCHEMA_ONLY_DUMP_PREFLIGHT',schemaBytes=len(result.stdout))
  return receipt
 secret=secure.token_urlsafe(48).encode();stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');work=BASE/('preflight-'+stamp);work.mkdir(parents=True,mode=0o700)
 wrapped=work/'diagnostic-secret.kms';gc(['kms','encrypt','--key='+KEY,'--keyring='+RING,'--location='+R,'--plaintext-file=-','--ciphertext-file='+str(wrapped)],secret)
 seal(result.stderr,work/'schema-dump-diagnostic.gpg',secret)
 receipt.update(status='STOP_SCHEMA_DUMP_PREFLIGHT',category=diagnostic_category(result.stderr),encryptedDiagnosticDir=str(work))
 (work/'redacted-preflight-receipt.json').write_text(json.dumps(receipt,indent=2));del secret
 return receipt


def perform_insert_path_preflight(config,run_pg):
 result=run_pg('pg_dump',['--format=custom','--data-only','--inserts','--table=public.execution_runs','--no-password','--lock-wait-timeout=3s'])
 receipt={'sourceSha':config['sourceSha'],'table':'public.execution_runs','dataFormat':'INSERT','exitCode':result.returncode,'productionSqlApplied':False,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if result.returncode==0:
  verify=subprocess.run(['/usr/lib/postgresql/17/bin/pg_restore','--list'],input=result.stdout,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
  assert verify.returncode==0,'INSERT path archive validation failed'
  receipt.update(status='PASS_TARGETED_INSERT_ARCHIVE_READ_PATH',archiveBytes=len(result.stdout),tocSha256=hashlib.sha256(verify.stdout).hexdigest())
  return receipt
 secret=secure.token_urlsafe(48).encode();stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');work=BASE/('insert-preflight-'+stamp);work.mkdir(parents=True,mode=0o700)
 wrapped=work/'diagnostic-secret.kms';gc(['kms','encrypt','--key='+KEY,'--keyring='+RING,'--location='+R,'--plaintext-file=-','--ciphertext-file='+str(wrapped)],secret)
 seal(result.stderr,work/'insert-path-diagnostic.gpg',secret);del secret
 receipt.update(status='STOP_TARGETED_INSERT_ARCHIVE_READ_PATH',category=diagnostic_category(result.stderr),encryptedDiagnosticDir=str(work))
 return receipt
