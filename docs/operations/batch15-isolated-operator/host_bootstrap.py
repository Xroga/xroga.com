"""Trusted bootstrap for the single approved private verification VM.

Inputs are public source/image pins and compressed public test helpers. The
only secret loaded is this window's signing secret, kept in /run tmpfs. This
program never receives a database, user, provider or project-owner credential.
"""
import base64
import datetime
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zlib

PROJECT = 'project-c40d4821-e647-4fa2-92d'
REGISTRY = f'us-east4-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy'
HOST_ACCOUNT = f'xroga-b15-host-stage@{PROJECT}.iam.gserviceaccount.com'
SECRET = 'xroga-b15-stage-coordinator-20261031'
BASE = pathlib.Path('/opt/xroga-b15')
RUN = pathlib.Path('/run/xroga-b15')
SENSITIVE = []


def validate(config):
    if config.get('project') != PROJECT or config.get('hostAccount') != HOST_ACCOUNT:
        raise RuntimeError('HOST_SCOPE_MISMATCH')
    if not re.fullmatch('[a-f0-9]{40}', config.get('source', '')):
        raise RuntimeError('HOST_SOURCE_INVALID')
    if set(config.get('images', {})) != {'api', 'browser', 'proxy'}:
        raise RuntimeError('HOST_IMAGE_SET_INVALID')
    for kind, image in config['images'].items():
        if not re.fullmatch(re.escape(REGISTRY + '/xroga-b15-' + kind + '-stage@') + r'sha256:[a-f0-9]{64}', image):
            raise RuntimeError('HOST_IMAGE_ORIGIN_OR_DIGEST_INVALID')
    if not isinstance(config.get('cleanupEpoch'), (float, int)) or not time.time() < config['cleanupEpoch'] <= time.time() + 7200:
        raise RuntimeError('HOST_WINDOW_EXPIRED')
    helpers = config.get('helpers', [])
    if len(helpers) != 2 or {h.get('name') for h in helpers} != {'run-sandbox-probe.mjs', 'verify-egress-isolation.mjs'}:
        raise RuntimeError('HOST_HELPER_SET_INVALID')
    return config


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def retrieve(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=25) as response:
        return response.read()


def metadata(path):
    return retrieve('http://169.254.169.254/computeMetadata/v1/' + path,
                    {'Metadata-Flavor': 'Google'}).decode().strip()


def command(args, timeout=180, env=None):
    result = subprocess.run(args, capture_output=True, timeout=timeout, env=env)
    if result.returncode:
        raise RuntimeError('HOST_COMMAND_FAILED_' + pathlib.Path(args[0]).name)
    return result.stdout


def crc32c(raw):
    result = 0xffffffff
    for byte in raw:
        result ^= byte
        for _ in range(8):
            result = (result >> 1) ^ (0x82f63b78 if result & 1 else 0)
    return result ^ 0xffffffff


def safe_report(value):
    raw = json.dumps(value, separators=(',', ':')).encode()
    if any(secret and secret.encode() in raw for secret in SENSITIVE):
        raise RuntimeError('SECRET_FOUND_IN_HOST_EVIDENCE')
    if len(raw) > 180000:
        raise RuntimeError('HOST_EVIDENCE_TOO_LARGE')
    # The operator retrieves this through authenticated Google serial-output API.
    print('XROGA_B15_HOST_EVIDENCE=' + base64.b64encode(zlib.compress(raw)).decode(), flush=True)


def main(config):
    validate(config)
    if os.geteuid() != 0 or len(pathlib.Path('/proc/swaps').read_text().strip().splitlines()) != 1:
        raise RuntimeError('HOST_ROOT_OR_NO_SWAP_PREREQUISITE_FAILED')
    if metadata('project/project-id') != PROJECT or metadata('instance/service-accounts/default/email') != HOST_ACCOUNT:
        raise RuntimeError('HOST_NATIVE_IDENTITY_MISMATCH')
    private_ip = metadata('instance/network-interfaces/0/ip')
    if not re.fullmatch(r'10\.90\.0\.[0-9]{1,3}', private_ip):
        raise RuntimeError('HOST_PRIVATE_NETWORK_MISMATCH')
    if BASE.exists():
        raise RuntimeError('HOST_BOOTSTRAP_ALREADY_ATTEMPTED_INSPECT_DONT_REPLAY')
    BASE.mkdir(mode=0o755)
    RUN.mkdir(mode=0o700)
    command(['systemctl', 'start', 'docker'])
    command(['docker', 'version', '--format', '{{.Server.Version}}'])
    auth = json.loads(metadata('instance/service-accounts/default/token'))['access_token']
    SENSITIVE.append(auth)
    docker_config = RUN / 'docker'
    docker_config.mkdir(mode=0o700)
    auth_file = docker_config / 'config.json'
    auth_file.write_text(json.dumps({'auths': {'us-east4-docker.pkg.dev': {
        'auth': base64.b64encode(('oauth2accesstoken:' + auth).encode()).decode()}}}))
    auth_file.chmod(0o600)
    try:
        for image in config['images'].values():
            command(['docker', '--config', str(docker_config), 'pull', image], timeout=600)
            info = json.loads(command(['docker', 'image', 'inspect', image]))[0]
            if info['Config']['Labels'].get('org.opencontainers.image.revision') != config['source']:
                raise RuntimeError('HOST_IMAGE_SOURCE_LABEL_MISMATCH')
    finally:
        auth_file.unlink(missing_ok=True)
    if not shutil.which('git'):
        command(['apt-get', 'update', '-qq'], timeout=180)
        command(['apt-get', 'install', '--no-install-recommends', '-y', '-qq', 'git'], timeout=180)
    source = BASE / 'source'
    command(['git', 'init', str(source)])
    command(['git', '-C', str(source), 'remote', 'add', 'origin', 'https://github.com/Xroga/xroga.com.git'])
    command(['git', '-C', str(source), 'fetch', '--depth', '1', 'origin', config['source']], timeout=180)
    command(['git', '-C', str(source), 'checkout', '--detach', config['source']])
    if command(['git', '-C', str(source), 'rev-parse', 'HEAD']).decode().strip() != config['source']:
        raise RuntimeError('HOST_CHECKOUT_SOURCE_MISMATCH')
    extract = 'xroga-b15-coordinator-extract'
    cid = command(['docker', 'create', '--name', extract, config['images']['api']]).decode().strip()
    if not re.fullmatch('[a-f0-9]{64}', cid):
        raise RuntimeError('HOST_EXTRACT_CONTAINER_ID_INVALID')
    try:
        (BASE / 'bin').mkdir()
        (BASE / 'lib').mkdir()
        command(['docker', 'cp', cid + ':/usr/local/bin/node', str(BASE / 'bin/node')])
        command(['docker', 'cp', cid + ':/app', str(BASE / 'app')])
        for library in ('libstdc++.so.6', 'libgcc_s.so.1'):
            command(['docker', 'cp', '-L', cid + ':/usr/lib/x86_64-linux-gnu/' + library, str(BASE / 'lib' / library)])
    finally:
        command(['docker', 'rm', cid])
    environment = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                   'HOME': '/root', 'LD_LIBRARY_PATH': str(BASE / 'lib'), 'DOCKER_CONFIG': str(docker_config)}
    node = str(BASE / 'bin/node')
    if command([node, '--version'], env=environment).decode().strip() != 'v22.21.1':
        raise RuntimeError('HOST_NODE_TOOLCHAIN_MISMATCH')
    # Pure public bundles of the unchanged repository test harness. No npm
    # install, rebuild or paid model request is needed on the VM.
    for asset in config['helpers']:
        if asset['name'] not in ('run-sandbox-probe.mjs', 'verify-egress-isolation.mjs'):
            raise RuntimeError('HOST_HELPER_NAME_INVALID')
        raw = zlib.decompress(base64.b64decode(asset['compressed']))
        if hashlib.sha256(raw).hexdigest() != asset['sha256']:
            raise RuntimeError('HOST_HELPER_HASH_MISMATCH')
        (source / 'scripts/browser' / asset['name']).write_bytes(raw)
    evidence = RUN / 'evidence'
    evidence.mkdir(mode=0o700)
    import os as process_os
    process_os.chdir(source)
    (evidence / 'host-facts.json').write_bytes(command(['bash', 'deploy/browser-worker/host-facts.sh'], env=environment))
    if command(['git', 'status', '--porcelain', '--untracked-files=no']).strip():
        raise RuntimeError('HOST_TRACKED_CHECKOUT_CHANGED')
    (evidence / 'source.txt').write_text('commit=' + config['source'] + '\ntree=clean\n')
    probe_steps = [
        ('sandbox-probe.json', 'run-sandbox-probe.mjs', ['--image', config['images']['browser']]),
        ('egress-isolation.json', 'verify-egress-isolation.mjs', ['--image', config['images']['browser'], '--proxy-image', config['images']['proxy']]),
    ]
    for output, script, args in probe_steps:
        if time.time() + 600 >= config['cleanupEpoch']:
            raise RuntimeError('HOST_INSUFFICIENT_PROBE_TIME_REMAINING')
        result = subprocess.run([node, str(source / 'scripts/browser' / script), *args,
            '--label', 'GCE_HOST_TESTED', '--out', str(evidence / output)],
            capture_output=True, timeout=600, env=environment)
        (evidence / output.replace('.json', '.stdout')).write_bytes(result.stdout + result.stderr)
        if result.returncode:
            safe_report({'status': 'HOST_PROBE_FAILED', 'probe': script, 'exitCode': result.returncode,
                         'record': json.loads((evidence / output).read_text()) if (evidence / output).exists() else None})
            raise RuntimeError('HOST_SECURITY_PROBE_FAILED')
    result = subprocess.run([node, 'deploy/browser-worker/derive-seccomp.mjs', '--check'], capture_output=True, env=environment)
    (evidence / 'seccomp-check.txt').write_bytes(result.stdout + result.stderr + ('\nexit=' + str(result.returncode) + '\n').encode())
    sums = ''
    for name in ('host-facts.json', 'sandbox-probe.json', 'egress-isolation.json', 'seccomp-check.txt', 'source.txt', 'sandbox-probe.stdout', 'egress-isolation.stdout'):
        sums += hashlib.sha256((evidence / name).read_bytes()).hexdigest() + '  ' + name + '\n'
    (evidence / 'SHA256SUMS').write_text(sums)
    verdict = command([node, 'scripts/browser/evaluate-host-evidence.mjs', str(evidence), '--label', 'GCE_HOST_TESTED', '--repo', str(source)], env=environment)
    safe_report({'status': 'HOST_ACCEPTED', 'source': config['source'], 'host': json.loads((evidence / 'host-facts.json').read_text()),
                 'sandbox': json.loads((evidence / 'sandbox-probe.json').read_text()),
                 'egress': json.loads((evidence / 'egress-isolation.json').read_text()),
                 'evaluator': json.loads(verdict), 'checksums': sums})
    auth = json.loads(metadata('instance/service-accounts/default/token'))['access_token']
    SENSITIVE.append(auth)
    payload = json.loads(retrieve(f'https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{SECRET}/versions/1:access',
                                 {'Authorization': 'Bearer ' + auth}))['payload']
    secret_raw = base64.b64decode(payload['data'], validate=True)
    if crc32c(secret_raw) != int(payload['dataCrc32c']) or not re.fullmatch(b'[a-f0-9]{64}', secret_raw):
        raise RuntimeError('HOST_SIGNING_SECRET_INTEGRITY_FAILED')
    signing_secret = secret_raw.decode()
    SENSITIVE.append(signing_secret)
    values = {'NODE_ENV': 'production', 'XROGA_RUNTIME_ROLE': 'browser-coordinator',
        'XROGA_BROWSER_COORDINATOR_SECRET': signing_secret, 'XROGA_BROWSER_REPO_ROOT': str(source),
        'XROGA_BROWSER_IMAGE': config['images']['browser'], 'XROGA_BROWSER_PROXY_IMAGE': config['images']['proxy'],
        'XROGA_BROWSER_HOST_BIND': private_ip, 'XROGA_BROWSER_HOST_MAX_CONCURRENT': '1', 'PORT': '8080',
        'LD_LIBRARY_PATH': str(BASE / 'lib'), 'DOCKER_CONFIG': str(docker_config)}
    env_file = RUN / 'coordinator.env'
    env_file.write_text(''.join(name + '=' + value + '\n' for name, value in values.items()))
    env_file.chmod(0o600)
    unit = pathlib.Path('/etc/systemd/system/xroga-b15-coordinator.service')
    unit.write_text('[Unit]\nAfter=docker.service network-online.target\nRequires=docker.service\n'
        '[Service]\nType=simple\nUser=root\nEnvironmentFile=' + str(env_file) + '\n'
        'WorkingDirectory=' + str(source) + '\nExecStart=' + node + ' ' + str(BASE / 'app/dist/workers/browserCoordinatorHost.js') + '\n'
        'KillSignal=SIGTERM\nTimeoutStopSec=35\nRestart=no\nLogRateLimitIntervalSec=30s\nLogRateLimitBurst=20\n'
        '[Install]\nWantedBy=multi-user.target\n')
    command(['systemctl', 'daemon-reload'])
    command(['systemctl', 'start', 'xroga-b15-coordinator'])
    command(['systemctl', 'is-active', '--quiet', 'xroga-b15-coordinator'])
    safe_report({'status': 'COORDINATOR_READY', 'source': config['source'], 'privateIp': private_ip,
                 'nativeHostAccount': HOST_ACCOUNT, 'modelCalls': 0})


if __name__ == '__main__':
    try:
        main(json.loads(pathlib.Path(sys.argv[1]).read_text()))
    except Exception as error:
        # Never emit raw commands, metadata tokens, secret responses or page text.
        print('XROGA_B15_HOST_BOOTSTRAP_FAILED', flush=True)
        if isinstance(error, RuntimeError) and re.fullmatch(r'HOST_[A-Z0-9_]+', str(error)):
            print(str(error), flush=True)
        else:
            print('ERROR_TYPE=' + type(error).__name__, flush=True)
        raise SystemExit(1)
