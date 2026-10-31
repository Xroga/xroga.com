"""Pure resource specifications for the approved disposable environment.

No network, credential lookup or resource creation occurs in this module.
"""
import base64
import copy
import datetime
import hashlib
import json
import pathlib
import re
import time
import zlib

ROOT = pathlib.Path(__file__).resolve().parent
PROJECT = 'project-c40d4821-e647-4fa2-92d'
REGION = 'us-east4'
ZONE = 'us-central1-a'
STEM = 'xroga-b15'
VM = 'xroga-b15-host-verify-20261031'
API = 'xroga-b15-activation-stage-20261031'
JOB = 'xroga-b15-verification-20261031'
QUEUE = 'xroga-b15-browser-stage-20261031'
HOST_SA = f'xroga-b15-host-stage@{PROJECT}.iam.gserviceaccount.com'
STAGE_SA = f'xroga-b15-stage-verifier@{PROJECT}.iam.gserviceaccount.com'
SIGNING = 'xroga-b15-stage-coordinator-20261031'
CONFIG = 'xroga-platform-stage-20261026'
KEY = f'projects/{PROJECT}/locations/us-central1/keyRings/xroga-p3-verify-20261023/cryptoKeys/xroga-p3-staging-20261024'
REPOSITORY = f'projects/{PROJECT}/locations/{REGION}/repositories/cloud-run-source-deploy'
COMPUTE = f'https://www.googleapis.com/compute/v1/projects/{PROJECT}'
NETWORK = COMPUTE + '/global/networks/xroga-verify-net'
SUBNET = COMPUTE + '/regions/us-central1/subnetworks/xroga-verify-subnet'
IMAGE = COMPUTE + '/global/images/xroga-exec-base-20261026'
IMAGE_ID = '5308884476316794212'
BACKEND = COMPUTE + '/global/backendServices/xroga-b15-host-stage-backend'
PATHS = {'/v1/jobs', '/v1/jobs/*'}


def image_map(receipt, source):
    if not re.fullmatch('[a-f0-9]{40}', source) or receipt.get('source') != source:
        raise RuntimeError('IMMUTABLE_SOURCE_MISMATCH')
    images = {}
    for row in receipt.get('images', []):
        for kind in ('api', 'browser', 'proxy'):
            prefix = f'us-east4-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy/xroga-b15-{kind}-stage@'
            if re.fullmatch(re.escape(prefix) + 'sha256:[a-f0-9]{64}', row.get('reference', '')):
                if kind in images:
                    raise RuntimeError('DUPLICATE_IMAGE')
                images[kind] = row['reference']
    if set(images) != {'api', 'browser', 'proxy'} or len(receipt['images']) != 3:
        raise RuntimeError('IMAGE_SET_MISMATCH')
    return images


def expiry_condition(epoch):
    when = datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return {'title': 'xroga-b15-isolated-20261031',
            'description': 'Approved isolated verification only; explicitly removed during cleanup',
            'expression': f'request.time < timestamp("{when}")'}


def helper_assets():
    manifest = json.loads((ROOT / 'host-helpers/MANIFEST.json').read_text())
    result = []
    for row in manifest['files']:
        raw = (ROOT / 'host-helpers' / row['name']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != row['sha256']:
            raise RuntimeError('PUBLIC_HELPER_HASH_MISMATCH')
        result.append({'name': row['name'], 'sha256': row['sha256'],
                       'compressed': base64.b64encode(zlib.compress(raw, 9)).decode()})
    return result


def vm_body(source, images, cleanup_epoch):
    if not time.time() < cleanup_epoch <= time.time() + 7200:
        raise RuntimeError('WINDOW_NOT_BOUNDED')
    config = {'project': PROJECT, 'hostAccount': HOST_SA, 'source': source,
              'images': images, 'cleanupEpoch': cleanup_epoch, 'helpers': helper_assets()}
    # Public code and pins only. Authentication is exclusively native metadata.
    startup = '#!/bin/bash\nset -euo pipefail\numask 077\n'
    startup += "mkdir -p /run/xroga-bootstrap\n"
    for name, raw in [('host.py', (ROOT / 'host_bootstrap.py').read_bytes()),
                      ('public-config.json', json.dumps(config).encode())]:
        startup += f"printf '%s' '{base64.b64encode(raw).decode()}' | base64 -d > /run/xroga-bootstrap/{name}\n"
    startup += 'exec python3 -B /run/xroga-bootstrap/host.py /run/xroga-bootstrap/public-config.json\n'
    if len(startup.encode()) > 240000:
        raise RuntimeError('BOOTSTRAP_METADATA_TOO_LARGE')
    return {'name': VM, 'machineType': f'zones/{ZONE}/machineTypes/e2-medium',
        'labels': {'xroga-owner': 'b15-isolated-20261031', 'source': source},
        'tags': {'items': ['xroga-b15-host-stage']},
        'disks': [{'boot': True, 'autoDelete': True, 'type': 'PERSISTENT',
            'initializeParams': {'sourceImage': IMAGE, 'diskSizeGb': '20',
                'diskType': f'zones/{ZONE}/diskTypes/pd-standard'}}],
        'networkInterfaces': [{'network': NETWORK, 'subnetwork': SUBNET}],
        'serviceAccounts': [{'email': HOST_SA, 'scopes': ['https://www.googleapis.com/auth/cloud-platform']}],
        'scheduling': {'automaticRestart': False, 'onHostMaintenance': 'MIGRATE',
            'instanceTerminationAction': 'DELETE', 'maxRunDuration': {'seconds': '7200'}},
        'shieldedInstanceConfig': {'enableVtpm': True, 'enableIntegrityMonitoring': True},
        'metadata': {'items': [{'key': 'startup-script', 'value': startup},
            {'key': 'block-project-ssh-keys', 'value': 'true'}, {'key': 'enable-oslogin', 'value': 'TRUE'}]}}


def add_routes(original):
    result = copy.deepcopy(original)
    for matcher in result.get('pathMatchers', []):
        for rule in matcher.get('pathRules', []):
            if set(rule.get('paths', [])) & PATHS:
                raise RuntimeError('APPROVED_PATH_ALREADY_OWNED_STOP')
    host = next((h for h in result.get('hostRules', []) if 'api.xroga.com' in h['hosts']), None)
    if not host:
        raise RuntimeError('API_HOST_RULE_MISSING')
    matcher = next(m for m in result['pathMatchers'] if m['name'] == host['pathMatcher'])
    if matcher.get('routeRules'):
        raise RuntimeError('UNREVIEWED_ROUTE_RULE_PRECEDENCE')
    matcher.setdefault('pathRules', []).append({'paths': sorted(PATHS), 'service': BACKEND})
    return result


def remove_routes(current):
    result = copy.deepcopy(current)
    for matcher in result.get('pathMatchers', []):
        retained = []
        for rule in matcher.get('pathRules', []):
            overlap = set(rule.get('paths', [])) & PATHS
            if overlap:
                if rule.get('service') != BACKEND or set(rule['paths']) != PATHS:
                    raise RuntimeError('CONCURRENT_ROUTE_OWNERSHIP_CHANGE_STOP')
            else:
                retained.append(rule)
        matcher['pathRules'] = retained
    return result


def api_entrypoint():
    # Load once before importing index. The existing loader remains canonical.
    # Preserve all protected credentials in memory and validate destinations.
    return """await import('./dist/runtime/installSafeLogging.js');
delete process.env.NODE_ENV;
await import('./dist/loadPlatformEnvironment.js');
if(process.env.SUPABASE_URL!=='https://dqxnatoessviphudbhei.supabase.co')throw Error('STAGE_DATABASE_MISMATCH');
if(process.env.XROGA_DRIVE_R2_BUCKET!=='xroga-drive-test')throw Error('STAGE_BUCKET_MISMATCH');
const {resolveDatabaseUrls}=await import('./dist/lib/postgresConnect.js');
const urls=resolveDatabaseUrls();
if(!urls.length||urls.some(value=>{const u=new URL(value);return !u.hostname.includes('dqxnatoessviphudbhei')&&!decodeURIComponent(u.username).includes('dqxnatoessviphudbhei');}))throw Error('STAGE_DATABASE_CONNECTION_MISMATCH');
Object.assign(process.env,{NODE_ENV:'production',XROGA_DEPLOYMENT_ENVIRONMENT:'staging',RUN_SWARM_WORKER:'false',
XROGA_RELEASE_CANDIDATE:'1',STORAGE_WRITE_MODE:'r2',STORAGE_READ_ORDER:'r2',STORAGE_QUOTA_BYTES:'500000000',
XROGA_BROWSER_DISPATCH_DEADLINE_SECONDS:'900'});
await import('./dist/index.js');"""


def api_body(source, image, url):
    env = {'XROGA_RELEASE_SHA': source, 'XROGA_RELEASE_CANDIDATE': '1',
        'XROGA_RUNTIME_ROLE': 'api', 'XROGA_PLATFORM_CONFIG_FILE': '/secrets/xroga-platform/config.json',
        'XROGA_REQUIRE_MANAGED_CUSTODY': '1', 'XROGA_CREDENTIAL_KMS_PROVIDER': 'google_cloud',
        'XROGA_GOOGLE_CLOUD_KMS_KEY_NAME': KEY, 'XROGA_GOOGLE_CLOUD_AUTH_MODE': 'metadata_adc',
        'XROGA_BROWSER_WORKER_URL': 'https://api.xroga.com', 'XROGA_BROWSER_DISPATCH': 'cloud-tasks',
        'XROGA_BROWSER_TASKS_PROJECT': PROJECT, 'XROGA_BROWSER_TASKS_LOCATION': REGION,
        'XROGA_BROWSER_TASKS_QUEUE': QUEUE, 'XROGA_BROWSER_EXECUTE_URL': url + '/internal/browser/execute',
        'XROGA_BROWSER_EXECUTE_AUDIENCE': url, 'XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT': STAGE_SA,
        'XROGA_BROWSER_INTERNAL_MODE': 'cloud', 'XROGA_BROWSER_RECOVER_AUDIENCE': url,
        'XROGA_BROWSER_RECOVER_SERVICE_ACCOUNT': STAGE_SA}
    return {'ingress': 'INGRESS_TRAFFIC_ALL', 'labels': {'xroga-owner': 'b15-isolated-20261031'},
        'template': {'serviceAccount': STAGE_SA, 'scaling': {'minInstanceCount': 0, 'maxInstanceCount': 2},
            'maxInstanceRequestConcurrency': 1, 'timeout': '900s',
            'vpcAccess': {'networkInterfaces': [{'network': 'xroga-verify-net', 'subnetwork': 'xroga-api-private'}], 'egress': 'PRIVATE_RANGES_ONLY'},
            'containers': [{'image': image, 'command': ['node'], 'args': ['--input-type=module', '-e', api_entrypoint()],
                'ports': [{'containerPort': 8080}],
                'resources': {'limits': {'cpu': '1', 'memory': '1Gi'}, 'cpuIdle': True},
                'env': [{'name': k, 'value': v} for k, v in env.items()] +
                    [{'name': 'XROGA_BROWSER_COORDINATOR_SECRET', 'valueSource': {'secretKeyRef': {'secret': SIGNING, 'version': '1'}}}],
                'volumeMounts': [{'name': 'platform', 'mountPath': '/secrets/xroga-platform'}]}],
            'volumes': [{'name': 'platform', 'secret': {'secret': CONFIG, 'items': [{'version': '2', 'path': 'config.json'}]}}]}}
