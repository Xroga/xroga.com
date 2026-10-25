"""Physical Docker execution primitives on one secret-free, owner-bound GCE VM.

Invoked only through authenticated OS Login SSH. This is not a task planner,
scheduler, authority issuer or accounting service. Inputs arrive on encrypted
SSH stdin, never in metadata, command-line arguments, public HTTP or logs.
"""
import hashlib
import json
import os
import pathlib
import re
import selectors
import shlex
import signal
import subprocess
import sys
import time
import uuid

BINDING_FILE = pathlib.Path('/opt/xroga/runtime-binding.json')
WORKSPACE = pathlib.Path('/opt/xroga/work')
MAX_INPUT = 4 * 1024 * 1024
MAX_CAPTURE = 80000


class Refused(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def validate(request, binding):
    require(isinstance(request, dict) and isinstance(binding, dict), 'INVALID_REQUEST')
    require(request.get('binding') == {key: binding.get(key) for key in
            ['runtimeId', 'ownerBinding', 'projectBinding']}, 'RUNTIME_BINDING_MISMATCH')
    require(binding.get('expiresAtEpoch', 0) > time.time(), 'RUNTIME_EXPIRED')
    operation = request.get('operation')
    require(operation in ['probe', 'exec', 'start', 'stop', 'logs'], 'UNKNOWN_OPERATION')
    if operation in ['exec', 'start']:
        command = request.get('command')
        require(isinstance(command, list) and 0 < len(command) <= 128
                and all(isinstance(value, str) and '\0' not in value and len(value) <= MAX_INPUT
                        for value in command) and command[0], 'INVALID_COMMAND')
        environment = request.get('environment', {})
        require(isinstance(environment, dict) and len(environment) <= 128
                and all(isinstance(name, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,127}', name)
                        and isinstance(value, str) and '\0' not in value and len(value) <= 65536
                        for name, value in environment.items()), 'INVALID_ENVIRONMENT')
        require(request.get('networkPolicy') in ['none', 'registry-only', 'preview'], 'UNKNOWN_NETWORK_POLICY')
        require(request.get('image') in binding.get('allowedImages', []), 'IMAGE_NOT_ADMITTED')
        timeout = request.get('timeoutMs')
        require(type(timeout) is int and 1 <= timeout <= 600000, 'INVALID_EXECUTION_TIMEOUT')
        if operation == 'start':
            port = request.get('port')
            require(port is None or type(port) is int and 1 <= port <= 65535, 'INVALID_PROCESS_PORT')
            require(port is None or request['networkPolicy'] == 'preview', 'PORT_REQUIRES_PREVIEW_NETWORK')
            require(request.get('restartPolicy', 'never') in ['never', 'on_failure'], 'UNKNOWN_RESTART_POLICY')
    if operation in ['stop', 'logs']:
        require(type(request.get('pid')) is int and request['pid'] > 0, 'INVALID_PROCESS_REFERENCE')
    return operation


def docker(args, timeout=15):
    result = subprocess.run(['docker', *args], capture_output=True, timeout=timeout)
    require(result.returncode == 0, 'DOCKER_CONTROL_FAILED')
    return result.stdout


def container_arguments(request, binding, name):
    """Caller cannot override host mounts, isolation, resources or Docker flags."""
    memory = binding['memoryMb']
    pids = binding['maxProcesses']
    cpus = binding['cpus']
    require(type(memory) is int and 128 <= memory <= 4096
            and type(pids) is int and 16 <= pids <= 512
            and type(cpus) is int and 1 <= cpus <= 2, 'INVALID_BOUND_RESOURCE_LIMITS')
    args = ['--name', name, '--label', 'xroga.runtime=' + binding['runtimeId'], '--pull=never',
            '--init', '--read-only', '--user', '65532:65532', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--memory', str(memory) + 'm',
            '--memory-swap', str(memory) + 'm', '--cpus', str(cpus), '--pids-limit', str(pids),
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
            '--mount', 'type=bind,src=' + str(WORKSPACE) + ',dst=/work', '--workdir', '/work',
            '--network', 'none' if request['networkPolicy'] == 'none' else 'bridge',
            '--sysctl', 'net.ipv4.ip_unprivileged_port_start=0',
            '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1']
    # The pre-existing registry-only contract is network-enabled dependency
    # installation. This adapter must not claim a registry-domain allowlist.
    # Bootstrap separately denies metadata and private-network egress on bridge.
    for key, value in request.get('environment', {}).items():
        args += ['--env', key + '=' + value]
    args += ['--env', 'HOME=/tmp', request['image'], *request['command']]
    return args


def process_container(pid, binding, reference):
    require(isinstance(reference, str) and re.fullmatch(r'docker:xroga-process-[a-f0-9]{32}', reference),
            'INVALID_PROCESS_REFERENCE')
    name = reference[len('docker:'):]
    details = json.loads(docker(['inspect', name]))[0]
    require(details.get('Config', {}).get('Labels', {}).get('xroga.runtime') == binding['runtimeId']
            and (not details.get('State', {}).get('Running') or details['State'].get('Pid') == pid),
            'PROCESS_NOT_OWNED_OR_RUNNING')
    return name


def execute(request, binding):
    name = 'xroga-exec-' + uuid.uuid4().hex
    started = time.monotonic()
    timed_out = False
    limit = False
    output = {1: bytearray(), 2: bytearray()}
    process = None
    try:
        process = subprocess.Popen(['docker', 'run', '--rm', *container_arguments(request, binding, name)],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ, 1)
            selector.register(process.stderr, selectors.EVENT_READ, 2)
            while selector.get_map():
                if time.monotonic() - started > request['timeoutMs'] / 1000 or time.time() >= binding['expiresAtEpoch']:
                    timed_out = True
                    break
                for key, _ in selector.select(timeout=0.1):
                    chunk = os.read(key.fileobj.fileno(), 8192)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    output[key.data].extend(chunk)
                    if len(output[key.data]) > MAX_CAPTURE:
                        output[key.data] = output[key.data][-MAX_CAPTURE:]
                        limit = True
                if limit:
                    break
        if timed_out or limit:
            subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=15)
        code = process.wait(timeout=15)
        return {'exitCode':code, 'stdout':output[1].decode(errors='replace'),
                'stderr':output[2].decode(errors='replace'), 'timedOut':timed_out,
                'killedForLimit':limit, 'durationMs':int((time.monotonic() - started) * 1000)}
    finally:
        # Includes transport disconnect, malformed exit and controller cancellation.
        subprocess.run(['docker', 'rm', '--force', name], capture_output=True, timeout=15)
        if process and process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def dispatch(request, binding):
    operation = validate(request, binding)
    # Refuse bridge execution if bootstrap did not install the metadata/private
    # egress guard. Never turn a missing firewall into an unrestricted fallback.
    if operation == 'probe' or request.get('networkPolicy') in ['registry-only', 'preview']:
        for rule in [['-C', 'DOCKER-USER', '-i', 'docker0', '-j', 'XROGA_EXEC_EGRESS'],
                     *[['-C', 'XROGA_EXEC_EGRESS', '-d', cidr, '-j', 'DROP'] for cidr in
                       ['10.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16']]]:
            checked = subprocess.run(['iptables', *rule],capture_output=True,timeout=5)
            require(checked.returncode == 0, 'NETWORK_GUARD_UNAVAILABLE')
    if operation == 'probe':
        docker(['version', '--format', '{{.Server.APIVersion}}'])
        for image in binding.get('allowedImages', []):
            docker(['image', 'inspect', image])
        return {'available':True, 'networkIsolation':True,
                'controlSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
    if operation == 'exec':
        return execute(request, binding)
    if operation == 'start':
        # Restart admission remains explicit. No denied or revoked action is
        # automatically retried by this low-level transport.
        name = 'xroga-process-' + uuid.uuid4().hex
        # A physical process supervisor preserves the requested bounded restart
        # policy. It cannot retry after expiry, and removing its container stops
        # the complete process tree. The Docker daemon has no restart grant.
        deadline = int(binding['expiresAtEpoch'])
        retries = 3 if request.get('restartPolicy') == 'on_failure' else 0
        command = shlex.join(request['command'])
        script = (f'deadline={deadline}; attempt=0; while :; do '
                  'left=$((deadline - $(date +%s))); [ "$left" -gt 0 ] || exit 124; '
                  f'/usr/bin/timeout --signal=TERM --kill-after=2s "${{left}}s" {command}; code=$?; '
                  f'[ "$code" -ne 0 ] && [ "$attempt" -lt {retries} ] || exit "$code"; '
                  'attempt=$((attempt + 1)); sleep 1; done')
        supervised = {**request, 'command':['/bin/sh','-c',script]}
        args = container_arguments(supervised, binding, name)
        port = request.get('port')
        if port:
            args = ['--publish', binding['privateIp'] + ':' + str(port) + ':' + str(port), *args]
        docker(['run', '--detach', *args])
        details = json.loads(docker(['inspect', name]))[0]
        require(details['State']['Running'] and details['State']['Pid'] > 0, 'PROCESS_START_FAILED')
        return {'pid':details['State']['Pid'], 'logPath':'docker:' + name}
    name = process_container(request['pid'], binding, request.get('processReference'))
    if operation == 'stop':
        docker(['rm', '--force', name])
        return {'stopped':True}
    result = subprocess.run(['docker', 'logs', '--tail', '200', name], capture_output=True, timeout=15)
    require(result.returncode == 0, 'PROCESS_LOGS_FAILED')
    return {'logs':(result.stdout + result.stderr)[-MAX_CAPTURE:].decode(errors='replace')}


def main():
    # Keep supervising the bounded container even if an SSH client disconnects.
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT + 1)
        require(len(raw) <= MAX_INPUT, 'REQUEST_TOO_LARGE')
        binding = json.loads(BINDING_FILE.read_text())
        result = dispatch(json.loads(raw), binding)
        response = {'ok':True, 'result':result}
    except Refused as error:
        response = {'ok':False, 'code':str(error)}
    except Exception:
        # Never echo a command, environment, source body or provider error.
        response = {'ok':False, 'code':'EXECUTION_CONTROL_UNAVAILABLE'}
    try:
        print(json.dumps(response,separators=(',',':')))
    except BrokenPipeError:
        pass


if __name__ == '__main__':
    main()
