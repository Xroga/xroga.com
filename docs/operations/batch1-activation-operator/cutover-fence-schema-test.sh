#!/bin/bash
set -euo pipefail
export PATH="/nix/var/nix/profiles/default/bin:$PATH"
mkdir -p /tmp/xroga-pg /tmp/xroga-sock
chown postgres:postgres /tmp/xroga-pg /tmp/xroga-sock
su postgres -s /bin/bash -c "initdb -D /tmp/xroga-pg -A trust --no-locale >/tmp/init.log"
su postgres -s /bin/bash -c "pg_ctl -D /tmp/xroga-pg -o '-k /tmp/xroga-sock -c listen_addresses=' -w start >/tmp/start.log"
trap 'su postgres -s /bin/bash -c "pg_ctl -D /tmp/xroga-pg -m immediate -w stop >/dev/null" || true' EXIT
export PGHOST=/tmp/xroga-sock PGUSER=postgres PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
SQL
psql -v ON_ERROR_STOP=1 -q -f /proof/schema.sql
psql -v ON_ERROR_STOP=1 -q <<'SQL'
ALTER TABLE public.projects ADD PRIMARY KEY(id);
ALTER TABLE public.swarm_runs ADD PRIMARY KEY(id);
ALTER TABLE public.google_canonical_deliveries ADD PRIMARY KEY(id);
GRANT SELECT,INSERT,UPDATE ON public.projects,public.swarm_runs,public.google_canonical_deliveries TO service_role;
INSERT INTO auth.users(id) VALUES('22222222-2222-4222-8222-222222222222');
INSERT INTO public.projects(id,user_id,name,type) VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','synthetic fixture','app');
SQL
psql -v ON_ERROR_STOP=1 -q -f /proof/original.sql
psql -v ON_ERROR_STOP=1 -q -c "REVOKE ALL ON FUNCTION public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text) TO service_role;"
psql -qAt -c "SELECT md5(prosrc),proconfig,prosecdef,prorettype::regtype FROM pg_proc WHERE oid='public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure;"
sed 's/A retry with no checkpoint/A deliberately altered retry comment/' /proof/original.sql > /tmp/altered.sql
psql -v ON_ERROR_STOP=1 -q -f /tmp/altered.sql
if psql -v ON_ERROR_STOP=1 -q -f /proof/upgrade.sql >/tmp/guard.log 2>&1; then echo 'FAIL changed function passed upgrade guard'; exit 1; fi
absent=$(psql -qAt -c "SELECT to_regclass('public.xroga_release_fence') IS NULL")
[ "$absent" = t ] || { echo 'FAIL rejected upgrade left a gate'; exit 1; }
echo 'PASS altered function fails upgrade without partial schema'
psql -v ON_ERROR_STOP=1 -q -f /proof/original.sql
psql -v ON_ERROR_STOP=1 -q -c "GRANT EXECUTE ON FUNCTION public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text) TO anon;"
if psql -v ON_ERROR_STOP=1 -q -f /proof/upgrade.sql >/tmp/privilege-guard.log 2>&1; then echo 'FAIL unsafe function grants accepted'; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -c "REVOKE EXECUTE ON FUNCTION public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text) FROM anon;"
echo 'PASS unsafe function grants reject upgrade'
psql -v ON_ERROR_STOP=1 -q -f /proof/upgrade.sql
psql -v ON_ERROR_STOP=1 -q -c "CREATE TABLE public.install_demo(id int,source_sha text);"
psql -v ON_ERROR_STOP=1 -q <<'SQL' >/tmp/install-writer.log 2>&1 &
BEGIN;
INSERT INTO public.install_demo VALUES(1,'ca94c2f8a813524e47f5f7abc868acb1618a1c45');
SELECT pg_sleep(3);
COMMIT;
SQL
install_worker=$!
for attempt in $(seq 1 60); do
  held=$(psql -qAt -c "SELECT count(*) FROM pg_locks WHERE relation='public.install_demo'::regclass AND mode='RowExclusiveLock' AND granted")
  if [ "$held" -gt 0 ]; then break; fi
  sleep 0.1
done
[ "$held" -gt 0 ] || { echo 'FAIL no pre-install writer'; exit 1; }
start=$(date +%s)
psql -v ON_ERROR_STOP=1 -q -c "CREATE TRIGGER install_fence_guard BEFORE INSERT OR UPDATE OF source_sha ON public.install_demo FOR EACH ROW EXECUTE FUNCTION public.xroga_release_fence_check();"
elapsed=$(( $(date +%s) - start )); wait "$install_worker"
[ "$elapsed" -ge 2 ] || { echo 'FAIL trigger installation did not wait for pre-existing writer'; exit 1; }
echo 'PASS trigger installation waits for pre-existing writer'
psql -v ON_ERROR_STOP=1 -q -c "DROP TABLE public.install_demo;"
psql -v ON_ERROR_STOP=1 -q <<'SQL' > /tmp/worker.log 2>&1 &
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.enqueue_google_canonical_run('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{"prompt":"synthetic"}','ca94c2f8a813524e47f5f7abc868acb1618a1c45');
SELECT pg_sleep(3);
COMMIT;
SQL
worker=$!
for attempt in $(seq 1 60); do
  held=$(psql -qAt -c "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND mode='ShareLock' AND granted")
  if [ "$held" -gt 0 ]; then break; fi
  sleep 0.1
done
[ "$held" -gt 0 ] || { echo 'FAIL no in-flight shared lock'; exit 1; }
start=$(date +%s)
psql -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0));
UPDATE public.xroga_release_fence SET allowed_source=NULL WHERE singleton;
COMMIT;
SQL
elapsed=$(( $(date +%s) - start )); wait "$worker"
[ "$elapsed" -ge 2 ] || { echo 'FAIL fence did not wait for in-flight admission'; exit 1; }
echo 'PASS fence waits for existing admission'
if psql -v ON_ERROR_STOP=1 -q -c "SET ROLE service_role; UPDATE public.xroga_release_fence SET allowed_source='ca94c2f8a813524e47f5f7abc868acb1618a1c45';" >/tmp/denied.log 2>&1; then echo 'FAIL service role modified fence'; exit 1; fi
echo 'PASS service role cannot modify fence'
if psql -v ON_ERROR_STOP=1 -q -c "SET ROLE service_role; SELECT public.enqueue_google_canonical_run('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{\"prompt\":\"synthetic\"}','ca94c2f8a813524e47f5f7abc868acb1618a1c45');" >/tmp/denied.log 2>&1; then echo 'FAIL paused replay admitted'; exit 1; fi
echo 'PASS paused idempotent retry denied'
if psql -v ON_ERROR_STOP=1 -q -c "SET ROLE service_role; INSERT INTO public.google_canonical_deliveries(id,run_id,user_id,input_payload,source_sha) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','{}','ca94c2f8a813524e47f5f7abc868acb1618a1c45');" >/tmp/denied.log 2>&1; then echo 'FAIL direct old delivery bypassed fence'; exit 1; fi
echo 'PASS direct delivery insert denied while paused'
psql -v ON_ERROR_STOP=1 -q -c "BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0)); UPDATE public.xroga_release_fence SET allowed_source='85f83e3f1dcbb057d4a28d8a696dae8396d45114' WHERE singleton; COMMIT;" >/dev/null
if psql -v ON_ERROR_STOP=1 -q -c "SET ROLE service_role; SELECT public.enqueue_google_canonical_run('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{\"prompt\":\"synthetic\"}','ca94c2f8a813524e47f5f7abc868acb1618a1c45');" >/tmp/denied.log 2>&1; then echo 'FAIL old source admitted'; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -c "SET ROLE service_role; SELECT public.enqueue_google_canonical_run('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{\"prompt\":\"synthetic\"}','85f83e3f1dcbb057d4a28d8a696dae8396d45114');" >/dev/null
echo 'PASS old source denied and current source admitted'
if psql -v ON_ERROR_STOP=1 -q -c "SET ROLE service_role; SELECT public.enqueue_google_canonical_run('77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','{\"prompt\":\"synthetic\"}','85f83e3f1dcbb057d4a28d8a696dae8396d45114');" >/tmp/denied.log 2>&1; then echo 'FAIL foreign owner admitted'; exit 1; fi
rows=$(psql -qAt -c "SELECT count(*) FROM public.swarm_runs WHERE id='88888888-8888-4888-8888-888888888888'")
[ "$rows" = 0 ] || { echo 'FAIL denied admission persisted a run'; exit 1; }
echo 'PASS cross-tenant denial and atomic rollback'
if psql -v ON_ERROR_STOP=1 -q -f /proof/rollback.sql >/tmp/rollback-denied.log 2>&1; then echo 'FAIL rollback without paused gate'; exit 1; fi
echo 'PASS rollback denied until gate paused and runs drained'
psql -v ON_ERROR_STOP=1 -q -c "BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0)); UPDATE public.xroga_release_fence SET allowed_source=NULL WHERE singleton; COMMIT;" >/dev/null
if psql -v ON_ERROR_STOP=1 -q -f /proof/rollback.sql >/tmp/rollback-denied.log 2>&1; then echo 'FAIL rollback with active runs'; exit 1; fi
psql -v ON_ERROR_STOP=1 -q -c "UPDATE public.swarm_runs SET status='planning';"
if psql -v ON_ERROR_STOP=1 -q -f /proof/rollback.sql >/tmp/rollback-denied.log 2>&1; then echo 'FAIL rollback with planning runs'; exit 1; fi
echo 'PASS rollback denied with planning runs'
psql -v ON_ERROR_STOP=1 -q -c "UPDATE public.swarm_runs SET status='complete';"
psql -v ON_ERROR_STOP=1 -q -f /proof/rollback.sql >/dev/null
restored=$(psql -qAt -c "SELECT md5(prosrc)='9014766f51e6d9fd878cc5d4724383c2' AND to_regclass('public.xroga_release_fence') IS NULL FROM pg_proc WHERE oid='public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure")
[ "$restored" = t ] || { echo 'FAIL original function or fence cleanup'; exit 1; }
echo 'PASS rollback after pause and drain restores exact original function'
echo 'PASS LOCAL_POSTGRES_PROTOTYPE_NOT_PRODUCTION_ACCEPTANCE'
