"""Real isolated Docker dependency handoff, no cloud/production acceptance claim."""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import shutil
import signal
import subprocess
import tempfile
import time
import uuid
import zipfile

IMAGES = {
    'python': 'registry-1.docker.io/library/python@sha256:aa679aa4eed6eb56c1dc6ad3f1b98b7d2d788fd961596779d188fdedad97fb38',
    'rust': 'registry-1.docker.io/library/rust@sha256:c5d6b2e15a5d94ee3ec8494c1ab0cbb8a12440bbe4dc9e5e3b4b0624d2efd668',
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--control', required=True)
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    def interrupted(_signal, _frame):
        raise KeyboardInterrupt('TASK_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    spec = importlib.util.spec_from_file_location('native_control', args.control)
    control = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(control)
    task = str(uuid.uuid4())
    root = pathlib.Path(tempfile.mkdtemp(prefix='xroga-runtime-parity-'))
    work = root / 'work'
    work.mkdir(mode=0o777)
    work.chmod(0o777)
    control.WORKSPACE = work
    labels = {'io.xroga.cleanup.owner': 'XROGA_LOCAL_DISPOSABLE_JOB_V1',
              'io.xroga.cleanup.job': task, 'io.xroga.cleanup.disposable': 'true'}
    result = {'scope': 'REAL_DOCKER_NATIVE_CONTAINER_FLAGS_NOT_GOOGLE_OR_AUTHORITY_ACCEPTANCE',
              'task': task, 'sourceLfSha256': hashlib.sha256(pathlib.Path(args.control).read_bytes().replace(b'\r\n', b'\n')).hexdigest(),
              'freeBeforeBytes': shutil.disk_usage(root).free, 'executions': [], 'productionChanged': False,
              'cloudResourcesCreated': False}
    new_images, containers = [], []
    def run(parts, timeout=60):
        return subprocess.run(parts, capture_output=True, text=True, timeout=timeout)
    def execute(runtime, command):
        name = 'xroga-runtime-parity-' + task[:8] + '-' + str(len(containers))
        binding = {'runtimeId': task, 'ownerBinding': 'synthetic-owner', 'projectBinding': 'synthetic-project',
                   'expiresAtEpoch': time.time()+600, 'allowedImages': list(IMAGES.values()),
                   'memoryMb': 1024, 'maxProcesses': 128, 'cpus': 1, 'privateIp': '10.90.0.2'}
        request = {'image': IMAGES[runtime], 'networkPolicy': 'none', 'environment': {}, 'command': command}
        arguments = control.container_arguments(request, binding, name)
        assert '--read-only' in arguments and '--pull=never' in arguments
        assert arguments[arguments.index('--user')+1] == '65532:65532'
        assert arguments[arguments.index('--network')+1] == 'none'
        cmd = ['docker', 'run', '--rm']
        for key, value in labels.items():
            cmd += ['--label', key+'='+value]
        containers.append(name)
        p = run(cmd + arguments)
        result['executions'].append({'runtime': runtime, 'command': command, 'exitCode': p.returncode,
                                     'stdout': p.stdout[-4000:], 'stderr': p.stderr[-4000:]})
        return p.returncode
    try:
        for image in IMAGES.values():
            if run(['docker', 'image', 'inspect', image]).returncode != 0:
                new_images.append(image)
                pulled = run(['docker', 'pull', image], timeout=240)
                if pulled.returncode:
                    raise RuntimeError('OFFICIAL_IMAGE_PULL_FAILED')
        wheel = work / 'xroga_parity_fixture-0.0.1-py3-none-any.whl'
        files = {'xroga_parity_fixture.py': 'VALUE = 42\n',
                 'xroga_parity_fixture-0.0.1.dist-info/METADATA': 'Metadata-Version: 2.1\nName: xroga-parity-fixture\nVersion: 0.0.1\n',
                 'xroga_parity_fixture-0.0.1.dist-info/WHEEL': 'Wheel-Version: 1.0\nGenerator: xroga-synthetic-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n'}
        record = 'xroga_parity_fixture-0.0.1.dist-info/RECORD'
        files[record] = ''.join(name+',,\n' for name in [*files, record])
        with zipfile.ZipFile(wheel, 'w') as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        wheel.chmod(0o644)
        (work/'requirements.txt').write_text('/work/'+wheel.name+'\n')
        (work/'requirements.txt').chmod(0o644)
        py_setup = execute('python', ['pip', 'install', '--no-index', '--disable-pip-version-check', '-r', 'requirements.txt'])
        py_verify = execute('python', ['python', '-c', 'import xroga_parity_fixture; assert xroga_parity_fixture.VALUE == 42; print("PYTHON_DEPENDENCY_HANDOFF_PASS")'])
        (work/'src').mkdir(mode=0o777)
        (work/'Cargo.toml').write_text('[package]\nname="xroga_parity_fixture"\nversion="0.0.1"\nedition="2021"\n')
        (work/'src/lib.rs').write_text('#[test]\nfn value() { assert_eq!(6 * 7, 42); }\n')
        rust_setup = execute('rust', ['cargo', 'fetch', '--offline'])
        rust_verify = execute('rust', ['cargo', 'test', '--offline'])
        assert py_setup == 0 and py_verify == 0, 'Python setup did not survive into the next offline container'
        assert rust_setup == 0 and rust_verify == 0, 'Rust setup/offline compilation did not pass non-root read-only execution'
        result['status'] = 'PASS_REAL_DOCKER_RUNTIME_PARITY'
    except BaseException as error:
        result['status'] = 'FAIL_REAL_DOCKER_RUNTIME_PARITY'
        result['error'] = str(error) if isinstance(error, AssertionError) else type(error).__name__
        raise
    finally:
        result['containersRemoved'] = True
        for name in containers:
            p = run(['docker', 'inspect', name])
            if p.returncode:
                continue
            details = json.loads(p.stdout)[0]
            if all(details.get('Config', {}).get('Labels', {}).get(k) == v for k, v in labels.items()):
                run(['docker', 'rm', '-f', name])
            result['containersRemoved'] &= run(['docker', 'inspect', name]).returncode != 0
        assert root.resolve().parent == pathlib.Path(tempfile.gettempdir()).resolve() and root.name.startswith('xroga-runtime-parity-')
        # Native non-root processes own their build directories. A separate,
        # task-labelled cleanup container can remove only this synthetic mount.
        # It has no network, host socket, host process access or other mount.
        if run(['docker', 'image', 'inspect', IMAGES['python']]).returncode == 0:
            cleanup_name = 'xroga-runtime-parity-cleanup-' + task[:8]
            cleanup = ['docker', 'run', '--rm', '--pull=never', '--name', cleanup_name,
                       '--network=none', '--read-only', '--user=0:0', '--cap-drop=ALL', '--cap-add=DAC_OVERRIDE',
                       '--memory=128m', '--pids-limit=32', '--mount', 'type=bind,src='+str(root)+',dst=/task']
            for key, value in labels.items():
                cleanup += ['--label', key+'='+value]
            run(cleanup+[IMAGES['python'], 'python', '-c', 'import shutil; shutil.rmtree("/task/work")'], timeout=30)
            leftover = run(['docker', 'inspect', cleanup_name])
            if leftover.returncode == 0:
                metadata = json.loads(leftover.stdout)[0]
                if all(metadata.get('Config', {}).get('Labels', {}).get(k) == v for k, v in labels.items()):
                    run(['docker', 'rm', '-f', cleanup_name])
            result['containersRemoved'] &= run(['docker', 'inspect', cleanup_name]).returncode != 0
        result['newImagesRemoved'] = True
        for image in new_images:
            users = run(['docker', 'ps', '-aq', '--filter', 'ancestor='+image])
            if users.returncode == 0 and not users.stdout.strip():
                run(['docker', 'image', 'rm', image])
            result['newImagesRemoved'] &= run(['docker', 'image', 'inspect', image]).returncode != 0
        try:
            shutil.rmtree(root)
        except PermissionError:
            result['retainedSyntheticWorkspace'] = str(root)
        result['temporaryWorkspaceRemoved'] = not root.exists()
        result['freeAfterBytes'] = shutil.disk_usage(tempfile.gettempdir()).free
        pathlib.Path(args.receipt).write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
