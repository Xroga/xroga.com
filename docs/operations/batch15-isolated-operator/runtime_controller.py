"""Exact-resource operator for the approved isolated window, never production.

Every mutation has an intent record. Unknown submissions require readback, not
automatic replay. Cleanup edits only our own named resources and IAM bindings.
"""
import argparse
import base64
import copy
import datetime
import hashlib
import json
import os
import pathlib
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import runtime_plan as plan
import stage_controller as build
from host_bootstrap import crc32c

ROOT = pathlib.Path(__file__).resolve().parent
G = f'https://compute.googleapis.com/compute/v1/projects/{plan.PROJECT}'
S = f'https://secretmanager.googleapis.com/v1/projects/{plan.PROJECT}/secrets'
I = f'https://iam.googleapis.com/v1/projects/{plan.PROJECT}/serviceAccounts'
R = f'https://run.googleapis.com/v2/projects/{plan.PROJECT}/locations/{plan.REGION}'
T = f'https://cloudtasks.googleapis.com/v2/projects/{plan.PROJECT}/locations/{plan.REGION}/queues/{plan.QUEUE}'
K = 'https://cloudkms.googleapis.com/v1/' + plan.KEY
A = 'https://artifactregistry.googleapis.com/v1/' + plan.REPOSITORY
TOKEN = None
TOKEN_UNTIL = 0


def save(name, value):
    target = ROOT / name
    temporary = target.with_suffix('.pending')
    temporary.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    temporary.replace(target)


def read(name):
    return json.loads((ROOT / name).read_text())


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def api(url, method='GET', body=None, missing=False):
    global TOKEN, TOKEN_UNTIL
    parsed = urllib.parse.urlsplit(url)
    allowed = {'compute.googleapis.com', 'secretmanager.googleapis.com', 'iam.googleapis.com',
               'run.googleapis.com', 'cloudtasks.googleapis.com', 'cloudkms.googleapis.com', 'artifactregistry.googleapis.com'}
    if parsed.scheme != 'https' or parsed.netloc not in allowed or f'/projects/{plan.PROJECT}/' not in parsed.path:
        raise RuntimeError('UNAPPROVED_GOOGLE_ORIGIN_OR_PROJECT')
    if method != 'GET':
        window = read('active-window.json')
        if method not in ('DELETE', 'POST', 'PATCH', 'PUT'):
            raise RuntimeError('UNSUPPORTED_OPERATION')
        if time.time() >= window['cleanupEpoch'] and not window.get('cleaning'):
            raise RuntimeError('CLEANUP_DEADLINE_REACHED')
        # Exact collection creation URLs are admitted only by reviewed callers.
        approved = [G + '/zones/' + plan.ZONE + '/instances',
            G + '/zones/' + plan.ZONE + '/networkEndpointGroups', G + '/global/backendServices',
            G + '/global/healthChecks', G + '/global/firewalls', R + '/services', R + '/jobs',
            S, I, T.rsplit('/', 1)[0]]
        existing = {
            (K + ':getIamPolicy', 'POST'), (K + ':setIamPolicy', 'POST'),
            (A + ':setIamPolicy', 'POST'), (S + '/' + plan.CONFIG + ':setIamPolicy', 'POST'),
            (S + '/' + plan.CONFIG + '/versions/2:enable', 'POST'),
            (S + '/' + plan.CONFIG + '/versions/2:disable', 'POST'),
            (G + '/global/urlMaps/xroga-api-url-map', 'PUT')}
        exact_names = [plan.VM, plan.API, plan.JOB, plan.QUEUE, plan.SIGNING,
            'xroga-b15-host-stage', 'xroga-b15-stage-verifier', 'xroga-b15-host-stage-neg',
            'xroga-b15-host-stage-backend', 'xroga-b15-host-stage-health', 'xroga-b15-host-stage-lb']
        collection = url.split('?', 1)[0] in approved and method == 'POST'
        if collection:
            identifier = (body or {}).get('accountId') or (body or {}).get('name', '').split('/')[-1]
            if url.startswith(S + '?'):
                identifier = urllib.parse.parse_qs(parsed.query).get('secretId', [None])[0]
            if url.startswith(R + '/services?'):
                identifier = urllib.parse.parse_qs(parsed.query).get('serviceId', [None])[0]
            if url.startswith(R + '/jobs?'):
                identifier = urllib.parse.parse_qs(parsed.query).get('jobId', [None])[0]
            if identifier not in exact_names:
                raise RuntimeError('UNAPPROVED_COLLECTION_RESOURCE_NAME')
        if not collection and (url, method) not in existing and not any(name in parsed.path.split('/') or any(p.startswith(name + ':') or p.startswith(name + '@') for p in parsed.path.split('/')) for name in exact_names):
            raise RuntimeError('MUTATION_OUTSIDE_APPROVED_RESOURCE_SET')
    if TOKEN is None or time.time() >= TOKEN_UNTIL:
        TOKEN = build.token()
        TOKEN_UNTIL = time.time() + 300
    request = urllib.request.Request(url, method=method,
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
            raw = response.read(24 * 1024 * 1024)
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        if error.code == 404 and missing:
            return None
        raise RuntimeError('GOOGLE_HTTP_' + str(error.code) + '_' + method + '_' + parsed.netloc) from None


def mutate(name, url, method, body=None):
    window = read('active-window.json')
    if any(x['name'] == name for x in window['operations']):
        raise RuntimeError('EXISTING_INTENT_INSPECT_DO_NOT_REPLAY_' + name)
    record = {'name': name, 'method': method, 'url': url, 'atUtc': timestamp(),
        'status': 'INTENT', 'bodySha256': hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()}
    window['operations'].append(record)
    save('active-window.json', window)
    result = api(url, method, body)
    window = read('active-window.json')
    window['operations'][-1].update(status='SUBMITTED', operation=result.get('name') or result.get('selfLink'))
    save('active-window.json', window)
    return result


def policy_urls(resource):
    # IAM service accounts and KMS use POST getIamPolicy. Native IAM GETs for
    # Run/Secrets/Artifact Registry/Tasks all preserve policy version and etag.
    if resource.startswith(I + '/') or resource == K:
        return resource + ':getIamPolicy', 'POST', {'options': {'requestedPolicyVersion': 3}}
    return resource + ':getIamPolicy?options.requestedPolicyVersion=3', 'GET', None


def grant(resource, role, account):
    window = read('active-window.json')
    url, method, body = policy_urls(resource)
    policy = api(url, method, body)
    binding = {'role': role, 'members': ['serviceAccount:' + account],
               'condition': plan.expiry_condition(window['expiryEpoch'])}
    if binding in policy.get('bindings', []):
        raise RuntimeError('EXISTING_TEMPORARY_BINDING_INSPECT')
    policy['version'] = 3
    policy.setdefault('bindings', []).append(binding)
    # Save exact revocation scope before submission, never an entire policy rollback.
    window['grants'].append({'resource': resource, 'binding': binding})
    save('active-window.json', window)
    return mutate('grant-' + str(len(window['grants'])), resource + ':setIamPolicy', 'POST', {'policy': policy})


def validate_stage_bundle(raw):
    if len(raw) > 65536:
        raise RuntimeError('STAGE_CONFIGURATION_TOO_LARGE')
    bundle = json.loads(raw)
    if bundle.get('schemaVersion') != 1 or bundle.get('target') != 'xroga-api-google':
        raise RuntimeError('STAGE_CONFIGURATION_FORMAT_MISMATCH')
    env = bundle.get('environment', {})
    if env.get('SUPABASE_URL') != 'https://dqxnatoessviphudbhei.supabase.co':
        raise RuntimeError('STAGE_CONFIGURATION_DATABASE_MISMATCH')
    if env.get('XROGA_DRIVE_R2_BUCKET') != 'xroga-drive-test':
        raise RuntimeError('STAGE_CONFIGURATION_PRIVATE_TEST_BUCKET_MISSING')
    if not all(env.get(key) for key in ('SUPABASE_SERVICE_ROLE_KEY', 'XROGA_DRIVE_R2_ACCESS_KEY_ID', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY')):
        raise RuntimeError('STAGE_CONFIGURATION_REQUIRED_CREDENTIAL_MISSING')
    if not (env.get('XROGA_DRIVE_R2_ACCOUNT_ID') or env.get('CLOUDFLARE_R2_ACCOUNT_ID') or env.get('CLOUDFLARE_ACCOUNT_ID')):
        raise RuntimeError('STAGE_CONFIGURATION_R2_ACCOUNT_MISSING')
    urls = [env.get('DATABASE_URL') or env.get('SUPABASE_DB_URL')]
    if urls[0]:
        value = urllib.parse.urlsplit(urls[0])
        if 'dqxnatoessviphudbhei' not in value.hostname and 'dqxnatoessviphudbhei' not in urllib.parse.unquote(value.username or ''):
            raise RuntimeError('STAGE_CONFIGURATION_CONNECTION_MISMATCH')
    elif not env.get('SUPABASE_DB_PASSWORD'):
        raise RuntimeError('STAGE_CONFIGURATION_DATABASE_PASSWORD_MISSING')
    return {'database': 'dqxnatoessviphudbhei', 'bucket': 'xroga-drive-test', 'requiredCredentialNamesPresent': True,
            'valuesSaved': False, 'modelsCalled': False}


def preflight():
    image = api(G + '/global/images/xroga-exec-base-20261026')
    if image.get('id') != plan.IMAGE_ID or image.get('status') != 'READY':
        raise RuntimeError('BASE_IMAGE_ID_OR_STATE_MISMATCH')
    subnet = api(G + '/regions/us-central1/subnetworks/xroga-verify-subnet')
    if subnet['ipCidrRange'] != '10.90.0.0/26' or not subnet['network'].endswith('/xroga-verify-net'):
        raise RuntimeError('WORKER_NETWORK_MISMATCH')
    api_subnet = api(G + '/regions/us-east4/subnetworks/xroga-api-private')
    if api_subnet['ipCidrRange'] != '10.91.0.0/26' or not api_subnet['network'].endswith('/xroga-verify-net'):
        raise RuntimeError('API_NETWORK_MISMATCH')
    routers = api(G + '/regions/us-central1/routers').get('items', [])
    if not any(r['network'].endswith('/xroga-verify-net') and r.get('nats') for r in routers):
        raise RuntimeError('EXISTING_PRIVATE_WORKER_EGRESS_MISSING_NO_NEW_NAT_AUTHORIZED')
    original = api(G + '/global/urlMaps/xroga-api-url-map')
    plan.add_routes(original)
    version = api(S + '/' + plan.CONFIG + '/versions/2')
    if version.get('state') not in ('DISABLED', 'ENABLED'):
        raise RuntimeError('EXACT_STAGING_SECRET_NOT_RECOVERABLE')
    candidates = [G + '/zones/' + plan.ZONE + '/instances/' + plan.VM,
        R + '/services/' + plan.API, R + '/jobs/' + plan.JOB, T,
        S + '/' + plan.SIGNING, I + '/' + plan.HOST_SA, I + '/' + plan.STAGE_SA,
        G + '/global/backendServices/xroga-b15-host-stage-backend',
        G + '/global/healthChecks/xroga-b15-host-stage-health', G + '/global/firewalls/xroga-b15-host-stage-lb',
        G + '/zones/' + plan.ZONE + '/networkEndpointGroups/xroga-b15-host-stage-neg']
    if any(api(url, missing=True) is not None for url in candidates):
        raise RuntimeError('TEMPORARY_NAME_ALREADY_IN_USE_INSPECT')
    receipt = {'atUtc': timestamp(), 'baseImageId': image['id'], 'network': subnet['network'],
        'stageConfigurationState': version['state'], 'privateEgressPresent': True, 'temporaryNamesFree': True,
        'windowClockStarted': False, 'productionMutations': False}
    save('native-preflight.json', receipt)
    save('original-url-map.json', original)
    print(json.dumps(receipt))


def begin():
    build.approval()
    approved = read('STAGING-KMS-APPROVED.json')
    if not (approved.get('approved') is True and approved.get('amendmentCommit') == 'b9362e42adc461489bf76ebf92462caffa6dc99d'
            and approved.get('keyName') == plan.KEY and approved.get('principal') == plan.STAGE_SA
            and approved.get('role') == 'roles/cloudkms.cryptoKeyEncrypterDecrypter'):
        raise RuntimeError('KMS_AMENDMENT_APPROVAL_REQUIRED')
    source = read('SOURCE.json')['applicationSource']
    build.ci_gate(source)
    plan.image_map(read('immutable-images.json'), source)
    if (ROOT / 'active-window.json').exists():
        raise RuntimeError('WINDOW_EXISTS_INSPECT_NO_NEW_WINDOW')
    preflight()
    now = time.time()
    window = {'source': source, 'startedAtUtc': timestamp(), 'startEpoch': now, 'cleanupEpoch': now + 5400,
        'expiryEpoch': now + 7200, 'operations': [], 'grants': [], 'cleaning': False,
        'originalStageSecretState': read('native-preflight.json')['stageConfigurationState']}
    save('active-window.json', window)
    # Local watchdog is independent of this operator process. Expiring IAM and
    # the VM's native DELETE deadline remain backstops if the laptop shuts down.
    child = subprocess.Popen([sys.executable, '-B', str(pathlib.Path(__file__).resolve()), 'watchdog'],
        cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    window['watchdogPid'] = child.pid
    save('active-window.json', window)
    if window['originalStageSecretState'] == 'DISABLED':
        mutate('enable-exact-stage-version', S + '/' + plan.CONFIG + '/versions/2:enable', 'POST', {})
    payload = api(S + '/' + plan.CONFIG + '/versions/2:access')['payload']
    raw = base64.b64decode(payload['data'], validate=True)
    if crc32c(raw) != int(payload['dataCrc32c']):
        raise RuntimeError('STAGE_SECRET_INTEGRITY_FAILURE')
    save('stage-configuration-preflight.json', validate_stage_bundle(raw))
    del raw, payload
    for account in ('xroga-b15-host-stage', 'xroga-b15-stage-verifier'):
        mutate('create-' + account, I, 'POST', {'accountId': account,
            'serviceAccount': {'displayName': 'Approved isolated Batch 1.5 verification, remove after window'}})
    mutate('create-signing-secret', S + '?secretId=' + plan.SIGNING, 'POST', {'replication': {'automatic': {}}})
    secret_raw = secrets.token_hex(32).encode()
    mutate('add-signing-version', S + '/' + plan.SIGNING + ':addVersion', 'POST',
        {'payload': {'data': base64.b64encode(secret_raw).decode(), 'dataCrc32c': str(crc32c(secret_raw))}})
    del secret_raw
    for account in (plan.HOST_SA, plan.STAGE_SA):
        grant(S + '/' + plan.SIGNING, 'roles/secretmanager.secretAccessor', account)
    grant(S + '/' + plan.CONFIG, 'roles/secretmanager.secretAccessor', plan.STAGE_SA)
    grant(A, 'roles/artifactregistry.reader', plan.HOST_SA)
    grant(K, 'roles/cloudkms.cryptoKeyEncrypterDecrypter', plan.STAGE_SA)
    grant(I + '/' + plan.STAGE_SA, 'roles/iam.serviceAccountUser', plan.STAGE_SA)
    print('ISOLATED_IDENTITIES_READY_NO_PRODUCTION_CHANGE')


def cleanup():
    if not (ROOT / 'active-window.json').exists():
        return
    window = read('active-window.json')
    window['cleaning'] = True
    save('active-window.json', window)
    errors = []
    def attempt(name, action):
        try:
            action()
        except Exception as error:
            errors.append({'step': name, 'errorType': type(error).__name__})
    # Remove only our two routes from CURRENT map, preserving concurrent voice
    # and default API edits. Fingerprint protects read/modify/write races.
    if any(o['name'] == 'add-host-routes' for o in window['operations']):
        def routes():
            current = api(G + '/global/urlMaps/xroga-api-url-map')
            changed = plan.remove_routes(current)
            if changed != current:
                api(G + '/global/urlMaps/xroga-api-url-map', 'PUT', changed)
        attempt('remove-only-approved-host-paths', routes)
    # Delete dependent objects before identities and secret. DELETE requests are
    # idempotent only after ownership has been established by our intent journal.
    resources = [
        ('create-stage-queue', T), ('create-stage-api', R + '/services/' + plan.API),
        ('create-verification-job', R + '/jobs/' + plan.JOB),
        ('create-host-backend', G + '/global/backendServices/xroga-b15-host-stage-backend'),
        ('create-host-neg', G + '/zones/' + plan.ZONE + '/networkEndpointGroups/xroga-b15-host-stage-neg'),
        ('create-host-health', G + '/global/healthChecks/xroga-b15-host-stage-health'),
        ('create-host-firewall', G + '/global/firewalls/xroga-b15-host-stage-lb'),
        ('create-host-vm', G + '/zones/' + plan.ZONE + '/instances/' + plan.VM)]
    for name, url in resources:
        if any(o['name'] == name for o in window['operations']):
            def remove(url=url):
                if api(url, missing=True) is not None:
                    result = api(url, 'DELETE')
                    wait_operation(result)
                if api(url, missing=True) is not None:
                    raise RuntimeError('DELETION_NOT_VERIFIED')
            attempt(name, remove)
    for row in reversed(window['grants']):
        def revoke(row=row):
            url, method, body = policy_urls(row['resource'])
            policy = api(url, method, body, missing=True)
            if policy is None:
                return
            policy['version'] = 3
            policy['bindings'] = [b for b in policy.get('bindings', []) if b != row['binding']]
            api(row['resource'] + ':setIamPolicy', 'POST', {'policy': policy})
        attempt('revoke-' + row['binding']['role'], revoke)
    for name, url in [('create-signing-secret', S + '/' + plan.SIGNING),
                       ('create-xroga-b15-stage-verifier', I + '/' + plan.STAGE_SA),
                       ('create-xroga-b15-host-stage', I + '/' + plan.HOST_SA)]:
        if any(o['name'] == name for o in window['operations']):
            attempt(name, lambda url=url: api(url, 'DELETE') if api(url, missing=True) is not None else None)
    if window['originalStageSecretState'] == 'DISABLED':
        attempt('restore-stage-version-disabled', lambda: api(S + '/' + plan.CONFIG + '/versions/2:disable', 'POST', {}))
    save('cleanup-receipt.json', {'atUtc': timestamp(), 'status': 'FAILED' if errors else 'PASS_RESOURCE_CLEANUP',
        'errors': errors, 'fixtureCleanup': 'NOT_CREATED_BY_BEGIN', 'productionChanged': False})
    if errors:
        raise RuntimeError('CLEANUP_HAS_REMAINING_OBLIGATIONS')


def wait_operation(result, deadline=180):
    name = result.get('name', '')
    if not name or result.get('done') is True or result.get('status') == 'DONE':
        if result.get('error'):
            raise RuntimeError('NATIVE_OPERATION_FAILED')
        return result
    if result.get('selfLink'):
        url = result['selfLink'].replace('https://www.googleapis.com/compute/', 'https://compute.googleapis.com/compute/')
    elif name.startswith('projects/'):
        url = 'https://run.googleapis.com/v2/' + name
    else:
        raise RuntimeError('NATIVE_OPERATION_LOCATION_UNKNOWN_INSPECT')
    limit = time.time() + deadline
    while time.time() < limit:
        observed = api(url)
        if observed.get('done') or observed.get('status') == 'DONE':
            if observed.get('error'):
                raise RuntimeError('NATIVE_OPERATION_FAILED')
            return observed
        time.sleep(3)
    raise RuntimeError('NATIVE_OPERATION_PENDING_INSPECT_DONT_REPLAY')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['preflight', 'begin', 'cleanup', 'watchdog'])
    args = parser.parse_args()
    if args.mode == 'preflight':
        preflight()
    elif args.mode == 'begin':
        try:
            begin()
        except Exception:
            cleanup()
            raise
    elif args.mode == 'cleanup':
        cleanup()
    else:
        while time.time() < read('active-window.json')['cleanupEpoch']:
            if (ROOT / 'cleanup-receipt.json').exists():
                return
            time.sleep(10)
        cleanup()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Error text is fixed application codes only, never provider response bodies.
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(json.dumps({'status': 'STOPPED', 'reason': message}))
        raise SystemExit(1)
