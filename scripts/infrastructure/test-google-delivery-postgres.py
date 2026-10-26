"""Isolated transport SQL proof, never a production migration command.

Runs in Linux Docker with no network/ports/host data mounts. Synthetic fixture
tables use the inspected production column types. This is not a full Supabase
fresh/upgrade or live caller acceptance substitute. Cleanup is task-scoped.
"""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import shutil
import signal
import subprocess
import time
import uuid

BOOTSTRAP = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
CREATE TABLE public.projects(id UUID PRIMARY KEY,user_id UUID REFERENCES auth.users(id));
CREATE TABLE public.swarm_runs(id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),
 project_id UUID REFERENCES public.projects(id),prompt TEXT NOT NULL,status TEXT, current_agent TEXT,
 iteration_count INTEGER DEFAULT 0,defects_found INTEGER DEFAULT 0,output JSONB,error TEXT,
 created_at TIMESTAMPTZ DEFAULT now(),completed_at TIMESTAMPTZ,messages JSONB,feature_category TEXT,
 token_usage JSONB,events JSONB NOT NULL DEFAULT '[]',last_sequence BIGINT NOT NULL DEFAULT 0,
 worker_id TEXT,heartbeat_at TIMESTAMPTZ,lease_generation UUID);
ALTER TABLE public.swarm_runs ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.swarm_runs,public.projects TO service_role;
INSERT INTO auth.users VALUES ('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
INSERT INTO public.projects VALUES ('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444');
"""
OWNER = '33333333-3333-4333-8333-333333333333'
SOURCE = 'b' * 40
def identifier(n):
    return f'{n:08x}-1111-4111-8111-111111111111'
def enqueue(n):
    return f"SELECT public.enqueue_google_canonical_run('{identifier(n)}','{identifier(100+n)}','{OWNER}',NULL,'{{\"prompt\":\"synthetic\"}}','{SOURCE}');"
def reserve(n, token=None):
    return f"SELECT public.reserve_google_canonical_launch('{identifier(n)}','{SOURCE}','{token or identifier(200+n)}');"
def claim(n, worker, generation):
    return f"SELECT public.claim_google_canonical_run('{identifier(n)}','{SOURCE}','{worker}','{generation}');"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--migration',required=True)
    parser.add_argument('--attempt-fence',required=True)
    parser.add_argument('--cancel',required=True)
    parser.add_argument('--receipt',required=True)
    parser.add_argument('--image',default='postgres:17.6-bookworm')
    args=parser.parse_args()
    def interrupted(_signal,_frame): raise KeyboardInterrupt('TASK_INTERRUPTED')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    task=str(uuid.uuid4());name='xroga-delivery-sql-'+task[:12]
    labels={'io.xroga.cleanup.owner':'XROGA_LOCAL_DISPOSABLE_JOB_V1','io.xroga.cleanup.job':task,'io.xroga.cleanup.disposable':'true'}
    result={'scope':'ISOLATED_POSTGRES_TRANSPORT_SCHEMA_NOT_FULL_SUPABASE_UPGRADE_OR_LIVE_CALLER',
        'task':task,'productionChanged':False,'cloudResourcesCreated':False,'checks':[],'freeBeforeBytes':shutil.disk_usage('.').free}
    created=False;pulled=False;image_id=None
    def command(parts,input=None,timeout=45):
        return subprocess.run(parts,input=input,text=True,capture_output=True,timeout=timeout)
    def checked(parts,input=None,timeout=45):
        r=command(parts,input,timeout)
        if r.returncode: raise RuntimeError(r.stderr[-4000:] or 'COMMAND_FAILED')
        return r.stdout.strip()
    def sql(text):
        return checked(['docker','exec','-i','--user','postgres',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],text)
    def service(text): return sql('SET ROLE service_role;\n'+text)
    def receipt(text): return json.loads(text.splitlines()[-1])
    try:
        initial=command(['docker','image','inspect',args.image])
        if initial.returncode:
            checked(['docker','pull',args.image],timeout=180);pulled=True
        image=json.loads(checked(['docker','image','inspect',args.image]))[0];image_id=image['Id'];result['imageDigests']=image['RepoDigests']
        launch=['docker','run','--detach','--name',name,'--network=none','--read-only','--memory=512m','--cpus=1','--pids-limit=128',
            '--security-opt=no-new-privileges','--tmpfs','/var/lib/postgresql/data:rw,size=268435456','--tmpfs','/var/run/postgresql:rw,size=16777216',
            '--tmpfs','/tmp:rw,size=16777216','--env','POSTGRES_HOST_AUTH_METHOD=trust']
        for key,value in labels.items():launch+=['--label',key+'='+value]
        checked(launch+[image_id]);created=True
        inspected=json.loads(checked(['docker','inspect',name]))[0]
        assert all(m['Type']=='tmpfs' for m in inspected['Mounts'])
        assert inspected['HostConfig']['NetworkMode']=='none' and not inspected['HostConfig']['PortBindings']
        for _ in range(80):
            # The official image briefly starts a temporary initialization
            # server, then restarts. Wait for the final PID 1 before admission.
            if command(['docker','exec',name,'sh','-c',
                '[ "$(cat /proc/1/comm)" = postgres ] && pg_isready -U postgres >/dev/null']).returncode==0:break
            time.sleep(.25)
        else:raise RuntimeError('POSTGRES_START_TIMEOUT')
        paths=[pathlib.Path(args.migration),pathlib.Path(args.attempt_fence),pathlib.Path(args.cancel)]
        result['sourceLfSha256']={p.name:hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest() for p in paths}
        sql(BOOTSTRAP);sql(paths[1].read_text());sql(paths[2].read_text().split('-- This distinct receipt boundary')[0]);sql(paths[0].read_text())
        service(enqueue(12));service(f"SELECT public.cancel_swarm_run_owned('{identifier(112)}','{OWNER}');")
        resumed=enqueue(12).replace(identifier(12),identifier(92)).replace('"synthetic"','"synthetic","clientMeta":{"resumeRun":true}')
        assert receipt(service(resumed))['deliveryId']==identifier(92)
        assert receipt(service(reserve(12)))['state']=='acknowledged', 'An old queued delivery regained dispatch authority after explicit resume'
        assert service(claim(12,identifier(301),identifier(401)))==''
        assert receipt(service(reserve(92)))['state']=='reserved'
        assert receipt(service(claim(92,identifier(301),identifier(401))))['freshStart'] is True
        service(f"SELECT public.cancel_swarm_run_owned('{identifier(112)}','{OWNER}');")
        result['checks'].append('explicit resume supersedes the old queued delivery without replaying its input')
        again=enqueue(12).replace(identifier(12),identifier(93)).replace('"synthetic"','"synthetic","clientMeta":{"resumeRun":true}')
        service(again);assert receipt(service(reserve(93)))['state']=='reserved'
        assert receipt(service(claim(93,identifier(302),identifier(402))))['freshStart'] is False
        service(f"SELECT public.cancel_swarm_run_owned('{identifier(112)}','{OWNER}');")
        result['checks'].append('fresh start is permitted only before any worker was admitted, later retries require canonical recovery')
        assert sql("SELECT has_table_privilege('authenticated','public.google_canonical_deliveries','SELECT') OR has_function_privilege('anon','public.claim_google_canonical_run(uuid,text,text,uuid)','EXECUTE');")=='f'
        result['checks'].append('anon/authenticated table and claim execution denied')
        first=receipt(service(enqueue(1)));assert first['deliveryId']==identifier(1)
        assert receipt(service(enqueue(1).replace(identifier(1),identifier(91))))['deliveryId']==identifier(1)
        foreign=command(['docker','exec','-i','--user','postgres',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],
            'SET ROLE service_role;'+enqueue(1).replace(OWNER,'44444444-4444-4444-8444-444444444444'))
        assert foreign.returncode!=0 and 'DELIVERY_NOT_FOUND' in foreign.stderr
        result['checks'].append('owner-bound enqueue, idempotency and foreign owner denial')
        assert receipt(service(reserve(1)))['state']=='reserved'
        assert receipt(service(reserve(1)))['state']=='busy'
        a=identifier(301);b=identifier(302);ga=identifier(401);gb=identifier(402)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            claims=list(pool.map(service,[claim(1,a,ga),claim(1,b,gb)]))
        winners=[json.loads(x) for x in claims if x]
        assert len(winners)==1;winner=winners[0]
        assert winner['userId']==OWNER and winner['runId']==identifier(101)
        result['checks'].append('two real psql processes yield exactly one canonical worker claim')
        state={'prompt':'synthetic','status':'complete','output':{'type':'text','text':'synthetic result'},'feature_category':None,
            'token_usage':None,'completed_at':'2026-10-26T00:00:00Z','iteration_count':1,'events':[],'last_sequence':0}
        assert service(f"SELECT public.persist_swarm_run_attempt('{identifier(101)}','{OWNER}','{winner['workerId']}','{winner['generation']}','{json.dumps(state)}');")=='t'
        result_call=f"SELECT public.record_google_canonical_result('{identifier(1)}','{OWNER}','{winner['workerId']}','{winner['generation']}',false,'[]');"
        assert service(result_call)=='t';assert service(result_call.replace(",false,",",true,"))=='f'
        assert service(result_call.replace(winner['generation'],identifier(999)))=='f'
        result['checks'].append('original terminal writer clears worker, preserves generation, and fences result false/contradiction/stale writes')
        service(enqueue(2));assert json.loads(service(f"SELECT public.cancel_swarm_run_owned('{identifier(102)}','{OWNER}');"))['status']=='cancelled'
        assert receipt(service(reserve(2)))['state']=='acknowledged';assert service(claim(2,a,ga))==''
        result['checks'].append('original cancellation RPC denies queued dispatch and worker claim')
        for n in [3,4,5]:service(enqueue(n))
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            reservations=[receipt(x) for x in pool.map(service,[reserve(n) for n in [3,4,5]])]
        assert sum(x['state']=='reserved' for x in reservations)==2 and sum(x['state']=='busy' for x in reservations)==1
        result['checks'].append('three real dispatcher processes reserve only two launch slots')
        sql("UPDATE public.google_canonical_deliveries SET launch_lease_until=clock_timestamp()-interval '1 second' WHERE state='launching';")
        for n in [3,4,5]:assert service(claim(n,a,ga))==''
        result['checks'].append('expired or unreserved launch cannot issue a worker')
        result['status']='PASS_SYNTHETIC_TRANSPORT_SQL'
    except (Exception,KeyboardInterrupt) as error:
        result['status']='INTERRUPTED' if isinstance(error,KeyboardInterrupt) else 'FAIL';result['error']=str(error)[:4000]
    finally:
        signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
        if created:
            current=json.loads(checked(['docker','inspect',name]))[0]
            if not all(current['Config']['Labels'].get(k)==v for k,v in labels.items()):raise RuntimeError('CLEANUP_OWNERSHIP_CHANGED')
            checked(['docker','rm','--force',name]);result['containerRemoved']=command(['docker','inspect',name]).returncode!=0
        if pulled and image_id and not checked(['docker','ps','-aq','--filter','ancestor='+image_id]):
            existing=json.loads(checked(['docker','image','inspect',image_id]))[0]
            tags=existing.get('RepoTags') or [];digests=existing.get('RepoDigests') or []
            if (tags==[args.image] and len(digests)<=1) or (not tags and digests==[args.image]):
                checked(['docker','image','rm',args.image]);result['newTaskImageRemoved']=command(['docker','image','inspect',image_id]).returncode!=0
            else:result['newTaskImageRetained']='Shared tag or reference needs review'
        result['freeAfterBytes']=shutil.disk_usage('.').free
        pathlib.Path(args.receipt).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    return 0 if result['status'].startswith('PASS') else 1

if __name__=='__main__':raise SystemExit(main())
