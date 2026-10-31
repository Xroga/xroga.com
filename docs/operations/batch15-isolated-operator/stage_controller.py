"""Bounded operator transport for the approved isolated verification package.

No credentials are persisted. Build preparation does not start the temporary
IAM/test clock. Every mutation records intent before submitting, so a lost
response cannot silently become a second billable build.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path('C:/Users/hp/Documents/Codex/2026-10-23/g/work/xroga-batch15-batch2-activation')
PROJECT = 'project-c40d4821-e647-4fa2-92d'
REGION = 'us-east4'
BUILD_ACCOUNT = '574998934848-compute@developer.gserviceaccount.com'
REGISTRY = f'{REGION}-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy'
PACKAGE = 'fa9e90d62f92a1961983d0b7e1f3cd2fa6836d6c'
REQUIRED = {'unit', 'integrated-candidate', 'build', 'deterministic-golden',
            'structured-mission-policy', 'disposable-policy-database', 'authenticated-browser'}
PS = 'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
GC = 'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1'


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(name, value):
    target = ROOT / name
    pending = target.with_suffix(target.suffix + '.pending')
    pending.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    pending.replace(target)


def source_identity(value):
    if not re.fullmatch('[a-f0-9]{40}', value or ''):
        raise RuntimeError('FULL_SOURCE_SHA_REQUIRED')
    return value


def approval():
    value = json.loads((ROOT / 'APPROVED-WINDOW.json').read_text())
    if not (value['approved'] is True and value['packageCommit'] == PACKAGE
            and value['maximumGrossUsd'] == 2 and value['modelSpendUsd'] == 0
            and value['maximumWindowSeconds'] == 7200):
        raise RuntimeError('EXACT_APPROVAL_REQUIRED')
    return value


def ci_gate(source):
    source_identity(source)
    head = json.loads(subprocess.check_output(
        ['gh', 'pr', 'view', '899', '--repo', 'Xroga/xroga.com', '--json', 'headRefOid'], text=True))
    if head['headRefOid'] != source:
        raise RuntimeError('PINNED_SOURCE_IS_NOT_REVIEWED_PR_HEAD')
    values = json.loads(subprocess.check_output(
        ['gh', 'pr', 'checks', '899', '--repo', 'Xroga/xroga.com', '--json', 'name,state,link'], text=True))
    checks = {v['name']: v for v in values}
    if any(checks.get(name, {}).get('state') != 'SUCCESS' for name in REQUIRED):
        raise RuntimeError('REQUIRED_CI_NOT_PASS')
    return {'source': source, 'atUtc': stamp(), 'checks': [checks[name] for name in sorted(REQUIRED)]}


def token():
    command = f"& '{GC}' auth print-access-token --account=mabdullah.built@gmail.com --project={PROJECT} --quiet"
    result = subprocess.run([PS, '-NoProfile', '-Command', command], capture_output=True, text=True, timeout=35)
    if result.returncode != 0:
        raise RuntimeError('LOCAL_GCLOUD_AUTH_FAILED')
    return result.stdout.strip()


def api(url, method='GET', body=None):
    allowed = ('https://cloudbuild.googleapis.com/v1/', 'https://artifactregistry.googleapis.com/v1/')
    if not url.startswith(allowed) or f'/projects/{PROJECT}/' not in url:
        raise RuntimeError('UNAPPROVED_API_ORIGIN')
    if method not in ('GET', 'POST') or (method == 'POST' and url !=
            f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds'):
        raise RuntimeError('UNAPPROVED_API_MUTATION')
    request = urllib.request.Request(url, method=method,
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, message, headers, new_url):
                return None
        with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never print provider bodies or bearer credentials.
        raise RuntimeError(f'GOOGLE_API_HTTP_{error.code}') from None


def build_plan(source):
    source_identity(source)
    names = {kind: f'{REGISTRY}/xroga-b15-{kind}-stage:{source}' for kind in ('api', 'browser', 'proxy')}
    git = 'gcr.io/cloud-builders/git'
    docker = 'gcr.io/cloud-builders/docker'
    bundle = """import {build} from 'esbuild';
import {mkdirSync,copyFileSync} from 'node:fs';
mkdirSync('/workspace/proxy/dist',{recursive:true});
await build({entryPoints:['backend/src/workers/proxySidecar.ts'],outfile:'/workspace/proxy/dist/egress-proxy-sidecar.mjs',bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'warning',banner:{js:'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);'}});
copyFileSync('deploy/browser-worker/Dockerfile.proxy','/workspace/proxy/Dockerfile');"""
    return {
        'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{BUILD_ACCOUNT}',
        'timeout': '1800s', 'queueTtl': '600s',
        'options': {'logging': 'CLOUD_LOGGING_ONLY'},
        'tags': ['xroga-b15-isolated-20261031', source],
        'steps': [
            {'name': git, 'args': ['init', '/workspace/src']},
            {'name': git, 'args': ['-C', '/workspace/src', 'remote', 'add', 'origin', 'https://github.com/Xroga/xroga.com.git']},
            {'name': git, 'args': ['-C', '/workspace/src', 'fetch', '--depth', '1', 'origin', source]},
            {'name': git, 'args': ['-C', '/workspace/src', 'checkout', '--detach', source]},
            {'name': docker, 'dir': 'src', 'args': ['build', '--build-arg', 'XROGA_RELEASE_SHA=' + source,
                '-f', 'Dockerfile.api', '-t', names['api'], '.']},
            {'name': docker, 'dir': 'src/deploy/browser-worker', 'args': ['build',
                '--label', 'org.opencontainers.image.revision=' + source, '-t', names['browser'], '.']},
            {'name': 'node:22.21.1-bookworm-slim', 'dir': 'src', 'entrypoint': 'bash',
                'args': ['-ceu', 'npm ci --ignore-scripts --no-audit --no-fund\nnode --input-type=module - <<\'XROGA_BUNDLE\'\n' + bundle + '\nXROGA_BUNDLE']},
            {'name': docker, 'args': ['build', '--label', 'org.opencontainers.image.revision=' + source,
                '-t', names['proxy'], '/workspace/proxy']},
        ],
        'images': list(names.values()),
    }


def submit_build(source):
    approval()
    gate = ci_gate(source)
    if (ROOT / 'build-journal.json').exists():
        raise RuntimeError('BUILD_INTENT_EXISTS_INSPECT_DO_NOT_RESUBMIT')
    body = build_plan(source)
    save('reviewed-build-plan.json', body)
    journal = {'status': 'SUBMIT_INTENT', 'source': source, 'atUtc': stamp(), 'ci': gate,
               'planSha256': hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
               'operatorSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
               'windowClockStarted': False, 'modelCalls': 0}
    save('build-journal.json', journal)
    result = api(f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds', 'POST', body)
    build = result.get('metadata', {}).get('build', {})
    journal.update(status='SUBMITTED', operation=result.get('name'), buildId=build.get('id'),
                   buildName=build.get('name'))
    save('build-journal.json', journal)
    print(json.dumps({'status': journal['status'], 'buildId': journal['buildId'], 'windowClockStarted': False}))


def build_status():
    journal = json.loads((ROOT / 'build-journal.json').read_text())
    build_id = journal.get('buildId')
    if not re.fullmatch('[a-f0-9-]{36}', build_id or ''):
        raise RuntimeError('BUILD_RESPONSE_UNKNOWN_INSPECT_NATIVE_BUILD_LIST')
    build = api(f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds/{build_id}')
    record = {k: build.get(k) for k in ('id', 'status', 'createTime', 'startTime', 'finishTime', 'results', 'failureInfo')}
    record.update(source=journal['source'], modelCalls=0, windowClockStarted=False)
    save('build-readback.json', record)
    if build['status'] == 'SUCCESS':
        expected = set(build_plan(journal['source'])['images'])
        images = build.get('results', {}).get('images', [])
        if {image['name'] for image in images} != expected or any(
                not re.fullmatch('sha256:[a-f0-9]{64}', image.get('digest', '')) for image in images):
            raise RuntimeError('BUILT_IMAGE_DIGEST_OR_SCOPE_MISMATCH')
        save('immutable-images.json', {'source': journal['source'], 'buildId': build_id,
            'atUtc': stamp(), 'images': [{'name': image['name'], 'digest': image['digest'],
                'reference': image['name'].rsplit(':', 1)[0] + '@' + image['digest']} for image in images]})
    print(json.dumps({'status': build['status'], 'buildId': build_id, 'windowClockStarted': False}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['plan', 'ci', 'build', 'status'])
    parser.add_argument('--source')
    args = parser.parse_args()
    if args.mode == 'plan':
        save('reviewed-build-plan.json', build_plan(args.source))
        print('BUILD_PLAN_WRITTEN_NO_CLOUD_CALL')
    elif args.mode == 'ci':
        print(json.dumps(ci_gate(args.source)))
    elif args.mode == 'build':
        submit_build(args.source)
    else:
        build_status()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({'status': 'STOPPED', 'reason': str(error)}))
        raise SystemExit(1)
