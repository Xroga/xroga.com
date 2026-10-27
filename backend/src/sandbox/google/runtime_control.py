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
import stat
import subprocess
import sys
import time
import uuid

BINDING_FILE = pathlib.Path('/opt/xroga/runtime-binding.json')
WORKSPACE = pathlib.Path('/opt/xroga/work')
MAX_INPUT = 4 * 1024 * 1024
MAX_CAPTURE = 80000
MAX_WORKSPACE_TRANSFER = 2 * 1024 * 1024
WORKSPACE_OPERATIONS = ['write_files', 'read_file', 'read_files', 'stat_files', 'delete_files']


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
    require(operation in ['probe', 'exec', 'start', 'stop', 'logs', *WORKSPACE_OPERATIONS], 'UNKNOWN_OPERATION')
    if operation in WORKSPACE_OPERATIONS:
        validate_workspace_request(request)
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


def workspace_parts(value):
    require(isinstance(value, str) and value and '\0' not in value and '\\' not in value
            and ':' not in value,
            'INVALID_WORKSPACE_PATH')
    try:
        require(len(value.encode('utf-8')) <= 2048, 'INVALID_WORKSPACE_PATH')
    except UnicodeError:
        raise Refused('INVALID_WORKSPACE_PATH') from None
    parts = value.split('/')
    require(len(parts) <= 128 and all(part not in ['', '.', '..']
            and len(part.encode('utf-8', errors='replace')) <= 255 for part in parts),
            'INVALID_WORKSPACE_PATH')
    return parts


def validate_workspace_request(request):
    operation = request['operation']
    if operation == 'read_file':
        workspace_parts(request.get('path'))
        return
    values = request.get('files' if operation == 'write_files' else 'paths')
    require(isinstance(values, list) and len(values) <= 1000, 'INVALID_WORKSPACE_FILES')
    seen = set()
    total = 0
    for value in values:
        if operation == 'write_files':
            require(isinstance(value, dict) and isinstance(value.get('content'), str), 'INVALID_WORKSPACE_FILES')
            path = value.get('path')
            try:
                total += len(value['content'].encode('utf-8'))
            except UnicodeError:
                raise Refused('INVALID_WORKSPACE_FILES') from None
            require(total <= MAX_WORKSPACE_TRANSFER, 'WORKSPACE_TRANSFER_LIMIT')
        else:
            path = value
        workspace_parts(path)
        require(path not in seen, 'INVALID_WORKSPACE_FILES')
        seen.add(path)


def workspace_operation(request, binding):
    """Descriptor-relative I/O. No shell, symlink traversal or host-path fallback.

    The workspace has its own bounded filesystem and is the only writable mount
    visible to workload containers. Holding every parent descriptor prevents a
    concurrent rename/symlink swap from redirecting privileged host file access.
    """
    require(os.name == 'posix' and hasattr(os, 'O_NOFOLLOW'), 'WORKSPACE_HOST_UNSUPPORTED')
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    root_fd = None

    def live():
        require(binding['expiresAtEpoch'] > time.time(), 'RUNTIME_EXPIRED')

    def regular(parent, name):
        try:
            value = os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            return None
        require(stat.S_ISREG(value.st_mode) and value.st_nlink == 1, 'UNSAFE_WORKSPACE_ENTRY')
        return value

    def parent_descriptor(parts, create):
        parent = os.dup(root_fd)
        try:
            for part in parts[:-1]:
                if create:
                    try:
                        os.mkdir(part, mode=0o700, dir_fd=parent)
                        if os.geteuid() == 0:
                            os.chown(part, owner.st_uid, owner.st_gid, dir_fd=parent, follow_symlinks=False)
                    except FileExistsError:
                        pass
                try:
                    child = os.open(part, directory_flags, dir_fd=parent)
                except FileNotFoundError:
                    os.close(parent)
                    return None
                except OSError:
                    raise Refused('UNSAFE_WORKSPACE_ENTRY') from None
                os.close(parent)
                parent = child
                require(os.fstat(parent).st_dev == owner.st_dev, 'UNSAFE_WORKSPACE_ENTRY')
            return parent
        except BaseException:
            os.close(parent)
            raise

    try:
        root_fd = os.open(WORKSPACE, directory_flags)
        owner = os.fstat(root_fd)
        require(not owner.st_mode & 0o022, 'UNSAFE_WORKSPACE_ENTRY')
        operation = request['operation']
        if operation in ['read_file', 'read_files', 'stat_files']:
            paths = [request['path']] if operation == 'read_file' else request['paths']
            files = []
            total = 0
            for path in paths:
                parts = workspace_parts(path)
                parent = parent_descriptor(parts, False)
                content = None
                size = None
                if parent is not None:
                    try:
                        live()
                        entry = regular(parent, parts[-1])
                        if entry is not None:
                            require(entry.st_size <= MAX_WORKSPACE_TRANSFER, 'WORKSPACE_TRANSFER_LIMIT')
                            size = entry.st_size
                            if operation != 'stat_files':
                                fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
                                with os.fdopen(fd, 'rb') as source:
                                    opened = os.fstat(source.fileno())
                                    require(stat.S_ISREG(opened.st_mode) and opened.st_nlink == 1, 'UNSAFE_WORKSPACE_ENTRY')
                                    raw = source.read(MAX_WORKSPACE_TRANSFER+1)
                                total += len(raw)
                                require(total <= MAX_WORKSPACE_TRANSFER, 'WORKSPACE_TRANSFER_LIMIT')
                                try:
                                    content = raw.decode('utf-8', errors='strict')
                                except UnicodeError:
                                    raise Refused('WORKSPACE_NOT_UTF8') from None
                    finally:
                        os.close(parent)
                live()
                files.append({'path':path, 'size':size} if operation == 'stat_files' else {'path':path, 'content':content})
            result = {'content':files[0]['content']} if operation == 'read_file' else {'files':files}
            require(len(json.dumps(result).encode()) <= MAX_INPUT, 'WORKSPACE_TRANSFER_LIMIT')
            return result
        changed = []
        values = request.get('files', []) if operation == 'write_files' else request['paths']
        for value in values:
            live()
            path = value['path'] if operation == 'write_files' else value
            parts = workspace_parts(path)
            parent = parent_descriptor(parts, operation == 'write_files')
            if parent is None:
                continue
            temporary = None
            try:
                entry = regular(parent, parts[-1])
                if operation == 'delete_files':
                    if entry is not None:
                        live()
                        os.unlink(parts[-1], dir_fd=parent)
                        changed.append(path)
                else:
                    temporary = '.xroga-write-' + uuid.uuid4().hex
                    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                                 0o600, dir_fd=parent)
                    with os.fdopen(fd, 'wb') as target:
                        target.write(value['content'].encode('utf-8'))
                        target.flush()
                        if os.geteuid() == 0:
                            os.fchown(target.fileno(), owner.st_uid, owner.st_gid)
                        os.fsync(target.fileno())
                    live()
                    os.replace(temporary, parts[-1], src_dir_fd=parent, dst_dir_fd=parent)
                    temporary = None
                    changed.append(path)
                os.fsync(parent)
            finally:
                if temporary is not None:
                    try:
                        os.unlink(temporary, dir_fd=parent)
                    except FileNotFoundError:
                        pass
                os.close(parent)
        return {'written' if operation == 'write_files' else 'deleted':changed}
    except Refused:
        raise
    except OSError:
        raise Refused('WORKSPACE_IO_FAILED') from None
    finally:
        if root_fd is not None:
            os.close(root_fd)


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
    # Separate setup and verification containers share only the bounded workspace.
    # Keep non-root dependency installs there rather than in the disposable /tmp.
    # Append fixed values after caller environment so these paths cannot redirect
    # installation into a host or image directory. Preserve the image's PATH.
    args += ['--env', 'HOME=/work/.xroga-home',
             '--env', 'PYTHONUSERBASE=/work/.xroga-home/python',
             '--env', 'CARGO_HOME=/work/.xroga-home/cargo', request['image'],
             'sh', '-c', 'umask 077; mkdir -p "$HOME" || exit; '
             'export PATH="$PYTHONUSERBASE/bin:$PATH"; exec "$@"',
             'xroga-runtime', *request['command']]
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
    if operation in WORKSPACE_OPERATIONS:
        return workspace_operation(request, binding)
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
